import * as fs from "fs"
import * as path from "path"
import { spawn } from "child_process"
import { getWorkspacePath } from "../../../utils/path"
import type { Linter } from "eslint"

/**
 * The type for ESLint rule configurations
 */
type ESLintRuleConfig = string | number | [string | number, ...any[]]

export interface LintMessage {
	severity: number
	line: number
	endLine: number
	column: number
	endColumn: number
	nodeType: string
	ruleId: string
	messageId: string
	message: string
}

export interface LinterReport {
	filePath: string
	warningCount: number
	errorCount: number
	messages: LintMessage[]
}

export function runCommand(command: string, options: string[], projectFolder: string) {
	return new Promise<string>((resolve, reject) => {
		const child = spawn(command, options, {
			cwd: projectFolder, // 设置子进程的工作目录
			stdio: ["ignore", "pipe", "pipe"],
		})

		let output = ""

		child.stdout?.on("data", (data) => {
			output += data.toString()
		})

		child.stderr?.on("data", (data) => {
			console.log(data.toString())
			// reject(data);
		})

		child.on("close", (code) => {
			console.log(`child process exited with code ${code}`)
			if (Number(code) === 0 || Number(code) === 1) {
				resolve(output)
			} else {
				reject(`child process exited with code ${code}`)
			}
		})

		// 错误处理
		child.on("error", (err) => {
			console.error(`Error: ${err.message}`)
			reject(err)
		})
	})
}

/**
 * Get possible ESLint config file paths
 */
const getESLintConfigPaths = (workspacePath: string): string[] => {
	return [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml"].map((filename) =>
		path.join(workspacePath, filename),
	)
}

/**
 * Get full ESLint config (including inherited rules)
 */
const getFullESLintConfig = async (workspacePath: string, filePath: string): Promise<Linter.Config | null> => {
	try {
		const result = await runCommand("npx", ["eslint", "--print-config", filePath], workspacePath)

		const config: Linter.Config = JSON.parse(result)
		return config
	} catch (error) {
		console.error("Failed to get ESLint config:", error)
		return null
	}
}

export const getConfigPath = async (workspacePath: string) => {
	// If getting full config fails, try reading config files directly
	const configPaths = getESLintConfigPaths(workspacePath)
	for (const configPath of configPaths) {
		if (fs.existsSync(configPath)) {
			return configPath
		}
	}
	return null
}

/**
 * Get workspace ESLint rules
 * @param defaultCwdPath Optional default working directory path
 * @returns ESLint rule object, returns null if configuration not found
 */
export const getWorkspaceESLintRules = async (
	defaultCwdPath = "",
): Promise<Record<string, ESLintRuleConfig | undefined> | null> => {
	const workspacePath = getWorkspacePath(defaultCwdPath)
	const configPath = await getConfigPath(workspacePath)
	if (!configPath) {
		return null
	}
	// Get full config (including inherited rules)
	let fullConfig = await getFullESLintConfig(workspacePath, configPath)

	if (fullConfig) {
		return fullConfig as Record<string, ESLintRuleConfig | undefined>
	}

	return null
}

export default async function getLintRules() {
	const eslintRules = await getWorkspaceESLintRules()
	if (!eslintRules) {
		return ""
	}
	const ruleText = `=== ESLint Rules ===
	   Project's ESLint rules enforced during code writing:
	   ${JSON.stringify(eslintRules, null, 2)}
	   ===
	 `
	return ruleText
}
