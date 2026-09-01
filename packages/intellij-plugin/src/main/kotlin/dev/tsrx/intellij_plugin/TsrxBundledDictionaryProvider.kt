package dev.tsrx.intellij_plugin

import com.intellij.spellchecker.BundledDictionaryProvider

class TsrxBundledDictionaryProvider : BundledDictionaryProvider {
	override fun getBundledDictionaries(): Array<String> =
		arrayOf("/dictionaries/tsrx.dic")
}
