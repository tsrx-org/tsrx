package dev.tsrx.intellij_plugin

import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet
import com.intellij.lexer.LexerBase

class TsrxParserDefinition : ParserDefinition {

    override fun createLexer(project: Project): Lexer = TsrxDummyLexer()

    override fun getWhitespaceTokens(): TokenSet = TokenSet.create(TokenType.WHITE_SPACE)

    override fun getCommentTokens(): TokenSet = TokenSet.EMPTY

    override fun getStringLiteralElements(): TokenSet = TokenSet.EMPTY

    override fun getFileNodeType(): IFileElementType = FILE

    override fun createParser(project: Project): PsiParser = TsrxDummyParser()

    override fun createFile(viewProvider: FileViewProvider): PsiFile = TsrxFile(viewProvider)

    override fun createElement(node: ASTNode): PsiElement =
        com.intellij.extapi.psi.ASTWrapperPsiElement(node)

    override fun spaceExistenceTypeBetweenTokens(left: ASTNode, right: ASTNode): ParserDefinition.SpaceRequirements =
        ParserDefinition.SpaceRequirements.MAY

    companion object {
        val FILE: IFileElementType = IFileElementType(TsrxLanguage)
    }
}

private class TsrxDummyLexer : LexerBase() {
    private var buffer: CharSequence = ""
    private var startOffset: Int = 0
    private var endOffset: Int = 0
    private var curOffset: Int = 0

    override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
        this.buffer = buffer
        this.startOffset = startOffset
        this.endOffset = endOffset
        this.curOffset = startOffset
    }

    override fun getState(): Int = 0

    override fun getTokenType(): IElementType? {
        if (curOffset >= endOffset) return null
        // Emit entire remaining text as BAD_CHARACTER so parser can consume it in one go
        return TokenType.BAD_CHARACTER
    }

    override fun getTokenStart(): Int = curOffset

    override fun getTokenEnd(): Int = endOffset

    override fun advance() {
        curOffset = endOffset
    }

    override fun getBufferSequence(): CharSequence = buffer
    override fun getBufferEnd(): Int = endOffset
}

private class TsrxDummyParser : PsiParser {
    override fun parse(root: IElementType, builder: PsiBuilder): ASTNode {
        val marker = builder.mark()
        while (!builder.eof()) {
            builder.advanceLexer()
        }
        marker.done(root)
        return builder.treeBuilt
    }
}
