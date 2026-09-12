package dev.tsrx.intellij_plugin

import com.intellij.lexer.Lexer
import com.intellij.openapi.util.TextRange
import java.util.ArrayDeque
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateElementType
import org.jetbrains.plugins.textmate.language.syntax.lexer.TextMateScope

internal object TsrxRainbowBracketAnalyzer {
	fun analyze(
		source: CharSequence,
		lexer: Lexer,
		checkCanceled: () -> Unit,
	): TsrxRainbowBracketAnalysis {
		val metrics = MutableMetrics()
		val delimiterCandidates = mutableListOf<DelimiterCandidate>()
		val pendingTagBegins = ArrayDeque<TagBegin>()
		val tags = mutableListOf<Tag?>()
		lexer.start(source)

		while (lexer.tokenType != null) {
			checkCanceled()
			metrics.lexerAdvances += 1
			val tokenType = lexer.tokenType
			val start = lexer.tokenStart
			val end = lexer.tokenEnd
			if (tokenType is TextMateElementType && start >= 0 && start < end && end <= source.length) {
				val scope = tokenType.scope
				when (scope.name()) {
					TAG_BEGIN_SCOPE -> {
						val begin = TagBegin(
							range = TextRange(start, end),
							closing = source.tokenEquals(start, end, "</"),
							order = tags.size,
						)
						pendingTagBegins.addLast(begin)
						tags += null
					}

					TAG_END_SCOPE -> if (pendingTagBegins.isNotEmpty()) {
						val begin = pendingTagBegins.removeLast()
						val range = TextRange(start, end)
						metrics.stackOperations += 2
						tags[begin.order] = Tag(
							begin = begin,
							end = range,
							name = source.tagName(begin.range.endOffset, range.startOffset),
							selfClosing = source.tokenEquals(start, end, "/>") && !begin.closing,
						)
					}

					else -> classifyDelimiter(
						scope = scope,
						source = source,
						start = start,
						end = end,
						order = delimiterCandidates.size,
					)?.let(delimiterCandidates::add)
				}
			}
			lexer.advance()
		}

		val structures = mergeStructures(
			pairDelimiters(source, delimiterCandidates, metrics, checkCanceled),
			pairTags(tags.filterNotNull(), metrics, checkCanceled),
		)
		val valid = discardCrossingSpans(structures, metrics, checkCanceled)
		val leveled = assignLevels(valid, metrics, checkCanceled)
		return TsrxRainbowBracketAnalysis(
			structures = leveled,
			operations = metrics.freeze(),
		)
	}

	private fun classifyDelimiter(
		scope: TextMateScope,
		source: CharSequence,
		start: Int,
		end: Int,
		order: Int,
	): DelimiterCandidate? {
		return when (scope.name()) {
		PARAMETERS_BEGIN_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.ROUND,
			TextRange(start, end),
			true,
			order = order,
		)
		PARAMETERS_END_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.ROUND,
			TextRange(start, end),
			false,
			order = order,
		)
		ROUND_SCOPE -> candidateForToken(TsrxRainbowBracketKind.ROUND, source, start, end, order)
		SQUARE_SCOPE -> candidateForToken(TsrxRainbowBracketKind.SQUARE, source, start, end, order)
		BLOCK_SCOPE -> candidateForToken(
			TsrxRainbowBracketKind.CURLY,
			source,
			start,
			end,
			order,
			if (scope.contains(TSRX_BLOCK_SCOPE)) {
				TsrxRainbowBracketOrigin.TEMPLATE_BLOCK
			} else {
				TsrxRainbowBracketOrigin.ORDINARY
			},
		)

		EMBEDDED_BEGIN_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			TextRange(start, end),
			true,
			TsrxRainbowBracketOrigin.JSX_EXPRESSION,
			order,
		)

		EMBEDDED_END_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			TextRange(start, end),
			false,
			TsrxRainbowBracketOrigin.JSX_EXPRESSION,
			order,
		)

		TEMPLATE_BEGIN_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			TextRange(start, end),
			true,
			TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION,
			order,
		)

		TEMPLATE_END_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			TextRange(start, end),
			false,
			TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION,
			order,
		)

		else -> fallbackCandidateForToken(scope, source, start, end, order)
		}
	}

	private fun fallbackCandidateForToken(
		scope: TextMateScope,
		source: CharSequence,
		start: Int,
		end: Int,
		order: Int,
	): DelimiterCandidate? {
		if (end - start != 1 || scope.containsLexicalContent()) return null
		val kind = when (source[start]) {
			'(', ')' -> TsrxRainbowBracketKind.ROUND
			'[', ']' -> TsrxRainbowBracketKind.SQUARE
			'{', '}' -> TsrxRainbowBracketKind.CURLY
			else -> return null
		}
		return candidateForToken(kind, source, start, end, order)
	}

	private fun candidateForToken(
		kind: TsrxRainbowBracketKind,
		source: CharSequence,
		start: Int,
		end: Int,
		order: Int,
		origin: TsrxRainbowBracketOrigin = TsrxRainbowBracketOrigin.ORDINARY,
	): DelimiterCandidate? = if (end - start != 1) {
		null
	} else when (source[start]) {
		'(', '[', '{' -> DelimiterCandidate(kind, TextRange(start, end), true, origin, order)
		')', ']', '}' -> DelimiterCandidate(kind, TextRange(start, end), false, origin, order)
		else -> null
	}

	private fun pairDelimiters(
		source: CharSequence,
		candidates: List<DelimiterCandidate>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<PendingStructure> {
		val stack = ArrayDeque<DelimiterCandidate>()
		val openCounts = mutableMapOf<DelimiterKey, Int>()
		val structures = arrayOfNulls<PendingStructure>(candidates.size)
		for (candidate in candidates) {
			checkCanceled()
			val key = candidate.key
			if (candidate.opening) {
				stack.addLast(candidate)
				openCounts[key] = openCounts.getOrDefault(key, 0) + 1
				metrics.stackOperations += 1
				continue
			}

			if (openCounts.getOrDefault(key, 0) == 0) continue
			if (stack.getLast().key != key) {
				do {
					checkCanceled()
					val discarded = stack.removeLast()
					openCounts.decrement(discarded.key)
					metrics.stackOperations += 1
				} while (discarded.key != key)
				continue
			}

			val opening = stack.removeLast()
			openCounts.decrement(key)
			metrics.stackOperations += 1
			structures[opening.order] = PendingStructure(
				kind = candidate.kind,
				origin = candidate.origin,
				span = TextRange(opening.range.startOffset, candidate.range.endOffset),
				punctuation = listOf(opening.range, candidate.range),
				isEmpty = source
					.subSequence(opening.range.endOffset, candidate.range.startOffset)
					.all(Char::isWhitespace),
			)
		}
		return structures.filterNotNull()
	}

	private fun pairTags(
		tags: List<Tag>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<PendingStructure> {
		val stack = ArrayDeque<Tag>()
		val openCounts = mutableMapOf<String, Int>()
		val structures = arrayOfNulls<PendingStructure>((tags.maxOfOrNull { it.begin.order } ?: -1) + 1)
		for (tag in tags) {
			checkCanceled()
			if (tag.selfClosing) {
				structures[tag.begin.order] = tag.asSelfClosingStructure()
				continue
			}
			if (!tag.begin.closing) {
				stack.addLast(tag)
				openCounts[tag.name] = openCounts.getOrDefault(tag.name, 0) + 1
				metrics.stackOperations += 1
				continue
			}

			if (openCounts.getOrDefault(tag.name, 0) == 0) continue
			if (stack.getLast().name != tag.name) {
				do {
					checkCanceled()
					val discarded = stack.removeLast()
					openCounts.decrement(discarded.name)
					metrics.stackOperations += 1
				} while (discarded.name != tag.name)
				continue
			}

			val opening = stack.removeLast()
			openCounts.decrement(tag.name)
			metrics.stackOperations += 1
			structures[opening.begin.order] = PendingStructure(
				kind = TsrxRainbowBracketKind.ANGLE,
				origin = TsrxRainbowBracketOrigin.JSX_TAG,
				span = TextRange(opening.begin.range.startOffset, tag.end.endOffset),
				punctuation = listOf(opening.begin.range, opening.end, tag.begin.range, tag.end),
				isEmpty = false,
			)
		}
		return structures.filterNotNull()
	}

	private fun mergeStructures(
		delimiters: List<PendingStructure>,
		tags: List<PendingStructure>,
	): List<PendingStructure> = buildList(delimiters.size + tags.size) {
		var delimiterIndex = 0
		var tagIndex = 0
		while (delimiterIndex < delimiters.size || tagIndex < tags.size) {
			val delimiter = delimiters.getOrNull(delimiterIndex)
			val tag = tags.getOrNull(tagIndex)
			val takeDelimiter = tag == null || delimiter != null && (
				delimiter.span.startOffset < tag.span.startOffset ||
					delimiter.span.startOffset == tag.span.startOffset && delimiter.span.endOffset >= tag.span.endOffset
			)
			if (takeDelimiter) {
				add(checkNotNull(delimiter))
				delimiterIndex += 1
			} else {
				add(checkNotNull(tag))
				tagIndex += 1
			}
		}
	}

	private fun discardCrossingSpans(
		structures: List<PendingStructure>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<PendingStructure> {
		val active = ArrayDeque<IndexedValue<PendingStructure>>()
		val invalid = BooleanArray(structures.size)
		for ((index, structure) in structures.withIndex()) {
			checkCanceled()
			while (active.isNotEmpty()) {
				metrics.intervalComparisons += 1
				if (structure.span.startOffset < active.getLast().value.span.endOffset) break
				active.removeLast()
				metrics.stackOperations += 1
			}
			var crossed = false
			while (active.isNotEmpty()) {
				metrics.intervalComparisons += 1
				if (structure.span.endOffset <= active.getLast().value.span.endOffset) break
				invalid[active.removeLast().index] = true
				metrics.stackOperations += 1
				crossed = true
			}
			if (crossed) {
				invalid[index] = true
			} else {
				active.addLast(IndexedValue(index, structure))
				metrics.stackOperations += 1
			}
		}
		return structures.filterIndexed { index, _ -> !invalid[index] }
	}

	private fun assignLevels(
		structures: List<PendingStructure>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<TsrxRainbowBracketStructure> {
		val active = ArrayDeque<PendingStructure>()
		val familyCounts = IntArray(TsrxRainbowBracketKind.entries.size)
		return buildList {
			for (structure in structures) {
				checkCanceled()
				while (active.isNotEmpty()) {
					metrics.intervalComparisons += 1
					if (structure.span.startOffset < active.getLast().span.endOffset) break
					familyCounts[active.removeLast().kind.ordinal] -= 1
					metrics.stackOperations += 1
				}
				add(
					TsrxRainbowBracketStructure(
						kind = structure.kind,
						origin = structure.origin,
						span = structure.span,
						punctuation = structure.punctuation,
						mixedLevel = active.size,
						familyLevel = familyCounts[structure.kind.ordinal],
						isEmpty = structure.isEmpty,
					),
				)
				active.addLast(structure)
				familyCounts[structure.kind.ordinal] += 1
				metrics.stackOperations += 1
			}
		}
	}

	private fun <K> MutableMap<K, Int>.decrement(key: K) {
		this[key] = getValue(key) - 1
	}

	private fun TextMateScope.name(): String? = scopeName?.toString()

	private fun TextMateScope.contains(expected: String): Boolean {
		var current: TextMateScope? = this
		while (current != null) {
			if (current.name() == expected) return true
			current = current.parent
		}
		return false
	}

	private fun TextMateScope.containsLexicalContent(): Boolean {
		var current: TextMateScope? = this
		while (current != null) {
			val name = current.name()
			if (name?.startsWith("string.") == true || name?.startsWith("comment.") == true) return true
			current = current.parent
		}
		return false
	}

	private fun CharSequence.tokenEquals(start: Int, end: Int, expected: String): Boolean {
		if (end - start != expected.length) return false
		for (index in expected.indices) {
			if (this[start + index] != expected[index]) return false
		}
		return true
	}

	private fun CharSequence.tagName(start: Int, end: Int): String {
		var index = start
		while (index < end && this[index].isWhitespace()) index += 1
		val nameStart = index
		while (index < end && (this[index].isLetterOrDigit() || this[index] in "_$.:-")) index += 1
		return subSequence(nameStart, index).toString()
	}

	private const val PARAMETERS_BEGIN_SCOPE = "punctuation.definition.parameters.begin.js"
	private const val PARAMETERS_END_SCOPE = "punctuation.definition.parameters.end.js"
	private const val ROUND_SCOPE = "meta.brace.round.js"
	private const val SQUARE_SCOPE = "meta.brace.square.js"
	private const val BLOCK_SCOPE = "punctuation.definition.block.js"
	private const val TSRX_BLOCK_SCOPE = "punctuation.definition.block.tsrx"
	private const val EMBEDDED_BEGIN_SCOPE = "punctuation.section.embedded.begin.js"
	private const val EMBEDDED_END_SCOPE = "punctuation.section.embedded.end.js"
	private const val TEMPLATE_BEGIN_SCOPE = "punctuation.definition.template-expression.begin.js"
	private const val TEMPLATE_END_SCOPE = "punctuation.definition.template-expression.end.js"
	private const val TAG_BEGIN_SCOPE = "punctuation.definition.tag.begin.js"
	private const val TAG_END_SCOPE = "punctuation.definition.tag.end.js"
}

internal enum class TsrxRainbowBracketKind {
	ROUND,
	SQUARE,
	CURLY,
	ANGLE,
}

internal enum class TsrxRainbowBracketOrigin {
	ORDINARY,
	TEMPLATE_BLOCK,
	JSX_EXPRESSION,
	TEMPLATE_SUBSTITUTION,
	JSX_TAG,
}

internal data class TsrxRainbowBracketStructure(
	val kind: TsrxRainbowBracketKind,
	val origin: TsrxRainbowBracketOrigin,
	val span: TextRange,
	val punctuation: List<TextRange>,
	val mixedLevel: Int,
	val familyLevel: Int,
	val isEmpty: Boolean,
)

internal data class TsrxRainbowBracketAnalysis(
	val structures: List<TsrxRainbowBracketStructure>,
	val operations: TsrxRainbowBracketOperations,
)

internal data class TsrxRainbowBracketOperations(
	val lexerAdvances: Int,
	val stackOperations: Int,
	val intervalComparisons: Int,
)

private data class DelimiterKey(
	val kind: TsrxRainbowBracketKind,
	val origin: TsrxRainbowBracketOrigin,
)

private data class DelimiterCandidate(
	val kind: TsrxRainbowBracketKind,
	val range: TextRange,
	val opening: Boolean,
	val origin: TsrxRainbowBracketOrigin = TsrxRainbowBracketOrigin.ORDINARY,
	val order: Int,
) {
	val key = DelimiterKey(kind, origin)
}

private data class PendingStructure(
	val kind: TsrxRainbowBracketKind,
	val origin: TsrxRainbowBracketOrigin,
	val span: TextRange,
	val punctuation: List<TextRange>,
	val isEmpty: Boolean,
)

private data class TagBegin(
	val range: TextRange,
	val closing: Boolean,
	val order: Int,
)

private data class Tag(
	val begin: TagBegin,
	val end: TextRange,
	val name: String,
	val selfClosing: Boolean,
) {
	fun asSelfClosingStructure() = PendingStructure(
		kind = TsrxRainbowBracketKind.ANGLE,
		origin = TsrxRainbowBracketOrigin.JSX_TAG,
		span = TextRange(begin.range.startOffset, end.endOffset),
		punctuation = listOf(begin.range, end),
		isEmpty = false,
	)
}

private class MutableMetrics {
	var lexerAdvances = 0
	var stackOperations = 0
	var intervalComparisons = 0

	fun freeze() = TsrxRainbowBracketOperations(
		lexerAdvances = lexerAdvances,
		stackOperations = stackOperations,
		intervalComparisons = intervalComparisons,
	)
}
