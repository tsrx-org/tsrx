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
		var pendingTag: PendingTag? = null
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
						val range = TextRange(start, end)
						if (source.isOuterTagBegin(start, end)) {
							val begin = TagBegin(
								range = range,
								closing = source.tokenEquals(start, end, "</"),
								order = tags.size,
							)
							pendingTag = PendingTag(begin, mutableListOf(range))
							tags += null
							metrics.stackOperations += 1
						} else {
							pendingTag?.punctuation?.add(range)
						}
					}

					TAG_END_SCOPE -> pendingTag?.let { current ->
						val range = TextRange(start, end)
						current.punctuation.add(range)
						if (source.isOuterTagEnd(start, end)) {
							pendingTag = null
							metrics.stackOperations += 1
							source.tagIdentity(
								current.begin.range.endOffset,
								range.startOffset,
								checkCanceled,
							)?.let { identity ->
								tags[current.begin.order] = Tag(
									begin = current.begin,
									end = range,
									identity = identity,
									punctuation = current.punctuation.toList(),
									selfClosing = source.tokenEquals(start, end, "/>") && !current.begin.closing,
								)
							}
						}
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
		if (
			end - start != 1 ||
			scope.containsLexicalContent() ||
			scope.contains(JSX_CHILDREN_SCOPE)
		) return null
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
				isEmpty = source.isWhitespaceOnly(
					opening.range.endOffset,
					candidate.range.startOffset,
					checkCanceled,
				),
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
		val openCounts = mutableMapOf<TagIdentity, Int>()
		val structures = arrayOfNulls<PendingStructure>((tags.maxOfOrNull { it.begin.order } ?: -1) + 1)
		for (tag in tags) {
			checkCanceled()
			if (tag.selfClosing) {
				structures[tag.begin.order] = tag.asSelfClosingStructure()
				continue
			}
			if (!tag.begin.closing) {
				stack.addLast(tag)
				openCounts[tag.identity] = openCounts.getOrDefault(tag.identity, 0) + 1
				metrics.stackOperations += 1
				continue
			}

			if (openCounts.getOrDefault(tag.identity, 0) == 0) continue
			if (stack.getLast().identity != tag.identity) {
				do {
					checkCanceled()
					val discarded = stack.removeLast()
					openCounts.decrement(discarded.identity)
					metrics.stackOperations += 1
				} while (discarded.identity != tag.identity)
				continue
			}

			val opening = stack.removeLast()
			openCounts.decrement(tag.identity)
			metrics.stackOperations += 1
			structures[opening.begin.order] = PendingStructure(
				kind = TsrxRainbowBracketKind.ANGLE,
				origin = TsrxRainbowBracketOrigin.JSX_TAG,
				span = TextRange(opening.begin.range.startOffset, tag.end.endOffset),
				punctuation = opening.punctuation + tag.punctuation,
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

	private fun CharSequence.isOuterTagBegin(start: Int, end: Int): Boolean =
		start < end && this[start] == '<'

	private fun CharSequence.isOuterTagEnd(start: Int, end: Int): Boolean =
		start < end && this[end - 1] == '>'

	private fun CharSequence.isWhitespaceOnly(
		start: Int,
		end: Int,
		checkCanceled: () -> Unit,
	): Boolean {
		for (index in start until end) {
			if ((index - start) % CANCELLATION_CHECK_INTERVAL == 0) checkCanceled()
			if (!this[index].isWhitespace()) return false
		}
		return true
	}

	private fun CharSequence.tagIdentity(
		start: Int,
		end: Int,
		checkCanceled: () -> Unit,
	): TagIdentity? {
		var index = start
		while (index < end && this[index].isWhitespace()) {
			if ((index - start) % CANCELLATION_CHECK_INTERVAL == 0) checkCanceled()
			index += 1
		}
		if (index == end) return TagIdentity(dynamic = false, value = "")

		if (this[index] == '{') {
			val expressionScanStart = index + 1
			index = expressionScanStart
			var expressionStart = -1
			var expressionEnd = -1
			while (index < end && this[index] != '}') {
				if ((index - expressionScanStart) % CANCELLATION_CHECK_INTERVAL == 0) checkCanceled()
				if (!this[index].isWhitespace()) {
					if (expressionStart == -1) expressionStart = index
					expressionEnd = index + 1
				}
				index += 1
			}
			if (index == end || expressionStart == -1) return null
			return TagIdentity(
				dynamic = true,
				value = subSequence(expressionStart, expressionEnd).toString(),
			)
		}

		val nameStart = index
		while (index < end && (this[index].isLetterOrDigit() || this[index] in "_$.:-")) {
			if ((index - nameStart) % CANCELLATION_CHECK_INTERVAL == 0) checkCanceled()
			index += 1
		}
		if (index == nameStart) return null
		return TagIdentity(
			dynamic = false,
			value = subSequence(nameStart, index).toString(),
		)
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
	private const val JSX_CHILDREN_SCOPE = "meta.jsx.children.js"
	private const val CANCELLATION_CHECK_INTERVAL = 256
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

private data class PendingTag(
	val begin: TagBegin,
	val punctuation: MutableList<TextRange>,
)

private data class TagIdentity(
	val dynamic: Boolean,
	val value: String,
)

private data class Tag(
	val begin: TagBegin,
	val end: TextRange,
	val identity: TagIdentity,
	val punctuation: List<TextRange>,
	val selfClosing: Boolean,
) {
	fun asSelfClosingStructure() = PendingStructure(
		kind = TsrxRainbowBracketKind.ANGLE,
		origin = TsrxRainbowBracketOrigin.JSX_TAG,
		span = TextRange(begin.range.startOffset, end.endOffset),
		punctuation = punctuation,
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
