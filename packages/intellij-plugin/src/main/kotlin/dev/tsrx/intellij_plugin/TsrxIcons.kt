package dev.tsrx.intellij_plugin

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

object TsrxIcons {
	@JvmField
	val FILE: Icon = IconLoader.getIcon("/icons/tsrx.svg", TsrxIcons::class.java)

	@JvmField
	val WIDGET: Icon = IconLoader.getIcon("/icons/tsrx-widget.svg", TsrxIcons::class.java)

	@JvmField
	val WIDGET_STATUSBAR: Icon = IconLoader.getIcon("/icons/tsrx-widget-statusbar.svg", TsrxIcons::class.java)
}
