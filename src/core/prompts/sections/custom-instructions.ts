import fs from "fs/promises"
import path from "path"
import { fileExistsAtPath, isDirectory } from "../../../utils/fs"
import { LANGUAGES } from "../../../shared/language"

async function safeReadFile(file: string, cwd: string): Promise<string> {
	let clineRulesFileInstructions: string = ""
	let ruleFileContent: string = ""
	const filePath = path.join(cwd, file)
	try {
		if (await fileExistsAtPath(filePath)) {
			if (await isDirectory(filePath)) {
				try {
					// Read all files in the .clinerules/ directory.
					const ruleFiles = await fs
						.readdir(filePath, { withFileTypes: true, recursive: true })
						.then((files) => files.filter((file) => file.isFile()))
						.then((files) => files.map((file) => path.resolve(filePath, file.name)))
					ruleFileContent = await Promise.all(
						ruleFiles.map(async (file) => {
							const ruleFilePathRelative = path.resolve(filePath, file)
							const fileContent = (await fs.readFile(ruleFilePathRelative, "utf8")).trim()
							return `${ruleFilePathRelative}:\n${fileContent}`
						}),
					).then((contents) => contents.join("\n\n"))
					clineRulesFileInstructions = `# ${file}/\n\nThe following is provided by a root-level ${file}/ directory where the user has specified instructions for this working directory (${path.posix.join(cwd)})\n\n${ruleFileContent}`
				} catch {
					console.error(`Failed to read .clinerules directory at ${filePath}`)
				}
			} else {
				ruleFileContent = (await fs.readFile(filePath, "utf8")).trim()
				if (ruleFileContent) {
					clineRulesFileInstructions = `# ${file}\n\nThe following is provided by a root-level ${file} file where the user has specified instructions for this working directory (${path.posix.join(cwd)})\n\n${ruleFileContent}`
				}
			}
		}
		return clineRulesFileInstructions
	} catch (err) {
		const errorCode = (err as NodeJS.ErrnoException).code
		if (!errorCode || !["ENOENT", "EISDIR"].includes(errorCode)) {
			throw err
		}
		return ""
	}
}

export async function loadRuleFiles(cwd: string): Promise<string> {
	const ruleFiles = [".clinerules", ".cursorrules", ".windsurfrules"]
	let combinedRules = ""
	for (const file of ruleFiles) {
		const content = await safeReadFile(file, cwd)
		if (content) {
			combinedRules += `\n${content}\n`
		}
	}

	return combinedRules
}

export async function addCustomInstructions(
	modeCustomInstructions: string,
	globalCustomInstructions: string,
	cwd: string,
	mode: string,
	options: { language?: string; rooIgnoreInstructions?: string } = {},
): Promise<string> {
	const sections = []

	// Load mode-specific rules if mode is provided
	let modeRuleContent = ""
	if (mode) {
		const modeRuleFile = `.clinerules-${mode}`
		modeRuleContent = await safeReadFile(modeRuleFile, cwd)
	}

	// Add language preference if provided
	if (options.language) {
		const languageName = LANGUAGES[options.language] || options.language
		sections.push(
			`Language Preference:\nYou should always speak and think in the "${languageName}" (${options.language}) language unless the user gives you instructions below to do otherwise.`,
		)
	}

	// Add global instructions first
	if (typeof globalCustomInstructions === "string" && globalCustomInstructions.trim()) {
		sections.push(`Global Instructions:\n${globalCustomInstructions.trim()}`)
	}

	// Add mode-specific instructions after
	if (typeof modeCustomInstructions === "string" && modeCustomInstructions.trim()) {
		sections.push(`Mode-specific Instructions:\n${modeCustomInstructions.trim()}`)
	}

	// Add rules - include both mode-specific and generic rules if they exist
	const rules = []

	// Add mode-specific rules first if they exist
	if (modeRuleContent && modeRuleContent.trim()) {
		const modeRuleFile = `.clinerules-${mode}`
		rules.push(`# Rules from ${modeRuleFile}:\n${modeRuleContent}`)
	}

	if (options.rooIgnoreInstructions) {
		rules.push(options.rooIgnoreInstructions)
	}

	// Add generic rules
	const genericRuleContent = await loadRuleFiles(cwd)
	if (genericRuleContent && genericRuleContent.trim()) {
		rules.push(genericRuleContent.trim())
	}

	if (rules.length > 0) {
		sections.push(`Rules:\n\n${rules.join("\n\n")}`)
	}

	const joinedSections = sections.join("\n\n")

	return joinedSections
		? `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

${joinedSections}`
		: ""
}
