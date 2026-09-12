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
		val ordinaryCandidates = mutableListOf<DelimiterCandidate>()
		val pendingTagBegins = ArrayDeque<TagBegin>()
		val tags = mutableListOf<Tag>()
		lexer.start(source)

		while (lexer.tokenType != null) {
			checkCanceled()
			metrics.lexerAdvances += 1
			val tokenType = lexer.tokenType
			val start = lexer.tokenStart
			val end = lexer.tokenEnd
			if (tokenType is TextMateElementType && start >= 0 && start < end && end <= source.length) {
				val scopes = tokenType.scope.names()
				val leafScope = scopes.firstOrNull()
				val tokenText = source.subSequence(start, end).toString()
				val range = TextRange(start, end)
				when (leafScope) {
					TAG_BEGIN_SCOPE -> pendingTagBegins.addLast(TagBegin(range, tokenText == "</"))
					TAG_END_SCOPE -> if (pendingTagBegins.isNotEmpty()) {
						val begin = pendingTagBegins.removeLast()
						metrics.stackOperations += 2
						tags += Tag(
							begin = begin,
							end = range,
							name = source.tagName(begin.range.endOffset, range.startOffset),
							selfClosing = tokenText == "/>" && !begin.closing,
						)
					}

					else -> classifyDelimiter(leafScope, scopes, tokenText, range)?.let(ordinaryCandidates::add)
				}
			}
			lexer.advance()
		}

		val structures = buildList {
			addAll(pairDelimiters(source, ordinaryCandidates, metrics, checkCanceled))
			addAll(pairTags(tags, metrics, checkCanceled))
		}
		val valid = discardCrossingSpans(structures, metrics, checkCanceled)
		val leveled = assignLevels(valid, metrics, checkCanceled)
		return TsrxRainbowBracketAnalysis(
			structures = leveled.sortedBy { it.punctuation.first().startOffset },
			operations = metrics.freeze(),
		)
	}

	private fun classifyDelimiter(
		leafScope: String?,
		scopes: List<String>,
		text: String,
		range: TextRange,
	): DelimiterCandidate? = when (leafScope) {
		PARAMETERS_BEGIN_SCOPE -> DelimiterCandidate(TsrxRainbowBracketKind.ROUND, range, true)
		PARAMETERS_END_SCOPE -> DelimiterCandidate(TsrxRainbowBracketKind.ROUND, range, false)
		ROUND_SCOPE -> candidateForText(TsrxRainbowBracketKind.ROUND, text, range)
		SQUARE_SCOPE -> candidateForText(TsrxRainbowBracketKind.SQUARE, text, range)
		BLOCK_SCOPE -> candidateForText(
			TsrxRainbowBracketKind.CURLY,
			text,
			range,
			if (TSRX_BLOCK_SCOPE in scopes) {
				TsrxRainbowBracketOrigin.TEMPLATE_BLOCK
			} else {
				TsrxRainbowBracketOrigin.ORDINARY
			},
		)

		EMBEDDED_BEGIN_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			range,
			true,
			TsrxRainbowBracketOrigin.JSX_EXPRESSION,
		)

		EMBEDDED_END_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			range,
			false,
			TsrxRainbowBracketOrigin.JSX_EXPRESSION,
		)

		TEMPLATE_BEGIN_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			range,
			true,
			TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION,
		)

		TEMPLATE_END_SCOPE -> DelimiterCandidate(
			TsrxRainbowBracketKind.CURLY,
			range,
			false,
			TsrxRainbowBracketOrigin.TEMPLATE_SUBSTITUTION,
		)

		else -> fallbackCandidateForText(scopes, text, range)
	}

	private fun fallbackCandidateForText(
		scopes: List<String>,
		text: String,
		range: TextRange,
	): DelimiterCandidate? {
		if (text.length != 1 || scopes.any { it.startsWith("string.") || it.startsWith("comment.") }) return null
		val kind = when (text[0]) {
			'(', ')' -> TsrxRainbowBracketKind.ROUND
			'[', ']' -> TsrxRainbowBracketKind.SQUARE
			'{', '}' -> TsrxRainbowBracketKind.CURLY
			else -> return null
		}
		return candidateForText(kind, text, range)
	}

	private fun candidateForText(
		kind: TsrxRainbowBracketKind,
		text: String,
		range: TextRange,
		origin: TsrxRainbowBracketOrigin = TsrxRainbowBracketOrigin.ORDINARY,
	): DelimiterCandidate? = when (text) {
		"(", "[", "{" -> DelimiterCandidate(kind, range, true, origin)
		")", "]", "}" -> DelimiterCandidate(kind, range, false, origin)
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
		val structures = mutableListOf<PendingStructure>()
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
			if (stack.last().key != key) {
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
			structures += PendingStructure(
				kind = candidate.kind,
				origin = candidate.origin,
				span = TextRange(opening.range.startOffset, candidate.range.endOffset),
				punctuation = listOf(opening.range, candidate.range),
				isEmpty = source
					.subSequence(opening.range.endOffset, candidate.range.startOffset)
					.all(Char::isWhitespace),
			)
		}
		return structures
	}

	private fun pairTags(
		tags: List<Tag>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<PendingStructure> {
		val stack = ArrayDeque<Tag>()
		val openCounts = mutableMapOf<String, Int>()
		val structures = mutableListOf<PendingStructure>()
		for (tag in tags.sortedBy { it.begin.range.startOffset }) {
			checkCanceled()
			if (tag.selfClosing) {
				structures += tag.asSelfClosingStructure()
				continue
			}
			if (!tag.begin.closing) {
				stack.addLast(tag)
				openCounts[tag.name] = openCounts.getOrDefault(tag.name, 0) + 1
				metrics.stackOperations += 1
				continue
			}

			if (openCounts.getOrDefault(tag.name, 0) == 0) continue
			if (stack.last().name != tag.name) {
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
			structures += PendingStructure(
				kind = TsrxRainbowBracketKind.ANGLE,
				origin = TsrxRainbowBracketOrigin.JSX_TAG,
				span = TextRange(opening.begin.range.startOffset, tag.end.endOffset),
				punctuation = listOf(opening.begin.range, opening.end, tag.begin.range, tag.end),
				isEmpty = false,
			)
		}
		return structures
	}

	private fun discardCrossingSpans(
		structures: List<PendingStructure>,
		metrics: MutableMetrics,
		checkCanceled: () -> Unit,
	): List<PendingStructure> {
		val sorted = structures.sortedWith(compareBy<PendingStructure>({ it.span.startOffset }, { -it.span.endOffset }))
		val active = ArrayDeque<IndexedValue<PendingStructure>>()
		val invalid = BooleanArray(sorted.size)
		for ((index, structure) in sorted.withIndex()) {
			checkCanceled()
			while (active.isNotEmpty()) {
				metrics.intervalComparisons += 1
				if (structure.span.startOffset < active.last().value.span.endOffset) break
				active.removeLast()
				metrics.stackOperations += 1
			}
			var crossed = false
			while (active.isNotEmpty()) {
				metrics.intervalComparisons += 1
				if (structure.span.endOffset <= active.last().value.span.endOffset) break
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
		return sorted.filterIndexed { index, _ -> !invalid[index] }
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
					if (structure.span.startOffset < active.last().span.endOffset) break
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

	private fun MutableMap<DelimiterKey, Int>.decrement(key: DelimiterKey) {
		this[key] = getValue(key) - 1
	}

	private fun MutableMap<String, Int>.decrement(key: String) {
		this[key] = getValue(key) - 1
	}

	private fun TextMateScope.names(): List<String> = buildList {
		var current: TextMateScope? = this@names
		while (current != null) {
			val name = current.scopeName.toString()
			if (name != "null") add(name)
			current = current.parent
		}
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
