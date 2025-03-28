import * as fs from "fs"
import * as path from "path"
import { ESLint, Linter } from "eslint"
import * as vscode from "vscode"

/**
 * Type definition for ESLint rule configuration
 */
type ESLintRuleConfig = string | number | [string | number, ...any[]]

/**
 * Get possible paths for ESLint configuration files
 */
const getESLintConfigPaths = (workspacePath: string): string[] => {
	return [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "package.json"].map((filename) =>
		path.join(workspacePath, filename),
	)
}

/**
 * Extract eslintConfig section from package.json
 */
const getESLintConfigFromPackageJson = async (packageJsonPath: string): Promise<Linter.Config | null> => {
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
		return packageJson.eslintConfig || null
	} catch {
		return null
	}
}

/**
 * Read and parse ESLint configuration file
 */
const parseESLintConfig = async (configPath: string): Promise<Linter.Config | null> => {
	try {
		if (!fs.existsSync(configPath)) {
			return null
		}

		if (path.basename(configPath) === "package.json") {
			return getESLintConfigFromPackageJson(configPath)
		}

		const content = fs.readFileSync(configPath, "utf8")
		return JSON.parse(content)
	} catch {
		return null
	}
}

/**
 * Get complete ESLint configuration (including inherited rules)
 */
const getFullESLintConfig = async (workspacePath: string): Promise<Linter.Config | null> => {
	try {
		const eslint = new ESLint({
			cwd: workspacePath,
		})

		// Get complete configuration (including all inherited rules)
		const config = await eslint.calculateConfigForFile("dummy.ts")
		return config
	} catch (error) {
		console.error("Error: Unable to retrieve ESLint configuration:", error)
		return null
	}
}

/**
 * Get workspace ESLint rules
 * @returns ESLint rules object, returns null if no configuration is found
 */
export const getWorkspaceESLintRules = async (): Promise<Record<string, ESLintRuleConfig | undefined> | null> => {
	const workspacePath = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
	if (workspacePath) {
		// Get complete configuration (including inherited rules)
		const fullConfig = await getFullESLintConfig(workspacePath)
		if (fullConfig?.rules) {
			return fullConfig.rules as Record<string, ESLintRuleConfig | undefined>
		}

		// If getting complete configuration fails, try reading config files directly
		const configPaths = getESLintConfigPaths(workspacePath)
		for (const configPath of configPaths) {
			const config = await parseESLintConfig(configPath)
			if (config?.rules) {
				return config.rules as Record<string, ESLintRuleConfig | undefined>
			}
		}
	}

	return null
}

/**
 * Get formatted ESLint rules list
 * @returns Formatted rules list containing rule names and severity levels
 */
export const getFormattedESLintRules = async () => {
	const rules = await getWorkspaceESLintRules()

	return rules
}

export default async function getESLintRules() {
	const rules = await getFormattedESLintRules()
	if (rules && Object.values(rules).length > 0) {
		const ruleText = `=== ESLint Rules ===
		The following ESLint rules must be followed when writing code:
		${JSON.stringify(rules, null, 2)}
		=======
	  `
		return ruleText
	}
	return ""
}
