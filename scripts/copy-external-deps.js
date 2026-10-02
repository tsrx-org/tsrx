import fs from 'fs';
import path from 'path';

/**
 * Recursively copy directory contents, avoiding symlink loops
 * @param {string} src
 * @param {string} dest
 * @param {Set<string>} visited
 */
function copyDir(src, dest, visited = new Set()) {
	// Resolve the real path to detect symlink loops
	const realSrc = fs.realpathSync(src);

	// Check if we've already visited this real path
	if (visited.has(realSrc)) {
		return; // Skip to avoid infinite loop
	}
	visited.add(realSrc);

	// Create destination directory
	if (!fs.existsSync(dest)) {
		fs.mkdirSync(dest, { recursive: true });
	}

	const entries = fs.readdirSync(src, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);

		if (entry.isDirectory()) {
			// Skip node_modules to avoid infinite loops in workspace packages
			if (entry.name === 'node_modules') {
				continue;
			}
			copyDir(srcPath, destPath, visited);
		} else if (entry.isSymbolicLink()) {
			// For symlinks, copy the target content, not the link itself
			try {
				const linkTarget = fs.readlinkSync(srcPath);
				const resolvedTarget = path.resolve(path.dirname(srcPath), linkTarget);

				if (fs.existsSync(resolvedTarget)) {
					const stat = fs.statSync(resolvedTarget);
					if (stat.isDirectory()) {
						copyDir(resolvedTarget, destPath, visited);
					} else {
						fs.copyFileSync(resolvedTarget, destPath);
					}
				}
			} catch (err) {
				// If symlink resolution fails, skip it
				console.warn(`  ⚠ Warning: Could not resolve symlink ${srcPath}`);
			}
		} else {
			// Regular file
			fs.copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Remove directory recursively
 * @param {string} dir
 */
function removeDir(dir) {
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Copy the external packages into `<distDir>/node_modules`, each from the real path
 * `resolveExternalPackages` resolved for it.
 * @param {string} distDir
 * @param {Map<string, string>} packages each package's name and real path
 */
export function copyExternalPackages(distDir, packages) {
	console.log(`📂 Copying ${packages.size} external packages...`);

	const distNodeModules = path.join(distDir, 'node_modules');
	fs.mkdirSync(distNodeModules, { recursive: true });

	for (const [packageName, srcPath] of packages) {
		const destPath = path.join(distNodeModules, packageName);
		// Scoped packages need their scope directory.
		fs.mkdirSync(path.dirname(destPath), { recursive: true });
		// Remove the previous copy for a clean one.
		removeDir(destPath);
		copyDir(srcPath, destPath);
		const version = JSON.parse(fs.readFileSync(path.join(srcPath, 'package.json'), 'utf8')).version;
		console.log(`  ✓ ${packageName}@${version}`);
	}

	console.log('✅ External dependencies copied successfully');
}
