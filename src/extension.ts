import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('env-creator.createEnv', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        
        // Find template files
        const templateFiles = findTemplateFiles(workspaceRoot);
        
        if (templateFiles.length === 0) {
            vscode.window.showErrorMessage('No .env template files found (e.g., .env.example, .env.template)');
            return;
        }

        let selectedTemplate: string;
        
        if (templateFiles.length === 1) {
            selectedTemplate = templateFiles[0];
        } else {
            // Let user choose which template to use
            const selected = await vscode.window.showQuickPick(
                templateFiles.map(file => ({
                    label: path.basename(file),
                    description: path.relative(workspaceRoot, file)
                })),
                { placeHolder: 'Select a template file' }
            );
            
            if (!selected) {
                return;
            }
            
            selectedTemplate = path.join(workspaceRoot, selected.description!);
        }

        const envPath = path.join(path.dirname(selectedTemplate), '.env');
        
        // Check if .env already exists
        if (fs.existsSync(envPath)) {
            const action = await vscode.window.showWarningMessage(
                '.env file already exists. Would you like to open the existing file or overwrite it?',
                'Open Existing',
                'Overwrite',
                'Cancel'
            );
            
            if (action === 'Open Existing') {
                // Open the existing .env file
                const document = await vscode.workspace.openTextDocument(envPath);
                await vscode.window.showTextDocument(document);
                return;
            } else if (action !== 'Overwrite') {
                // User selected Cancel or closed the dialog
                return;
            }
        }

        // Copy template to .env
        try {
            const templateContent = fs.readFileSync(selectedTemplate, 'utf8');
            
            // Process template content to create a snippet with tab stops
            const processedContent = processTemplateContent(templateContent);
            
            fs.writeFileSync(envPath, processedContent.content);
            
            // Open the file
            const document = await vscode.workspace.openTextDocument(envPath);
            const editor = await vscode.window.showTextDocument(document);
            
            // If we have tab stops, insert as snippet
            if (processedContent.hasTabStops) {
                // Clear the document and insert as snippet
                await editor.edit(editBuilder => {
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(document.getText().length)
                    );
                    editBuilder.delete(fullRange);
                });
                
                // Insert as snippet to enable tab navigation
                await editor.insertSnippet(new vscode.SnippetString(processedContent.snippetContent));
            }
            
            vscode.window.showInformationMessage('.env file created successfully');
            
            // Check if .gitignore exists and if .env is already in it
            await checkGitignore(workspaceRoot);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create .env file: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

function findTemplateFiles(rootPath: string): string[] {
    const templates: string[] = [];
    const templatePatterns = ['.env.example', '.env.template', '.env.sample', '.env.dist'];
    
    function searchDirectory(dirPath: string) {
        try {
            const files = fs.readdirSync(dirPath);
            
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = fs.statSync(filePath);
                
                if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                    searchDirectory(filePath);
                } else if (stat.isFile() && templatePatterns.includes(file)) {
                    templates.push(filePath);
                }
            }
        } catch (error) {
            // Ignore directories we can't read
        }
    }
    
    searchDirectory(rootPath);
    return templates;
}

async function checkGitignore(workspaceRoot: string) {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    let gitignoreContent = '';
    
    if (fs.existsSync(gitignorePath)) {
        gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    }
    
    // Check if .env is already in .gitignore
    const lines = gitignoreContent.split('\n');
    const hasEnv = lines.some(line => {
        const trimmed = line.trim();
        return trimmed === '.env' || trimmed === '/.env' || trimmed === '*.env';
    });
    
    if (!hasEnv) {
        const addToGitignore = await vscode.window.showInformationMessage(
            '.env is not in .gitignore. Would you like to add it?',
            'Yes',
            'No'
        );
        
        if (addToGitignore === 'Yes') {
            const newGitignoreContent = gitignoreContent + (gitignoreContent.endsWith('\n') ? '' : '\n') + '.env\n';
            fs.writeFileSync(gitignorePath, newGitignoreContent);
            vscode.window.showInformationMessage('.env added to .gitignore');
        }
    }
}

function processTemplateContent(content: string): {
    content: string;
    snippetContent: string;
    hasTabStops: boolean;
    firstValuePosition: number | null;
} {
    const lines = content.split('\n');
    const snippetLines: string[] = [];
    let tabStopIndex = 1;
    let hasTabStops = false;
    let firstValuePosition: number | null = null;
    let currentPosition = 0;
    
    for (const line of lines) {
        // Match lines that look like KEY=VALUE or KEY = VALUE (case insensitive)
        const envVarMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/i);
        
        if (envVarMatch) {
            const [fullMatch, key, value] = envVarMatch;
            const keyPart = `${key}=`;
            
            // Check if the value is empty or contains placeholder text
            const isPlaceholder = !value || 
                                value === '""' || 
                                value === "''" ||
                                value.includes('your-') ||
                                value.includes('YOUR_') ||
                                value.includes('example') ||
                                value.includes('EXAMPLE') ||
                                value.includes('placeholder') ||
                                value.includes('PLACEHOLDER') ||
                                value.includes('change-me') ||
                                value.includes('CHANGE_ME') ||
                                value.includes('xxx') ||
                                value.includes('XXX');
            
            if (isPlaceholder) {
                // Create a tab stop for this value
                snippetLines.push(`${keyPart}\${${tabStopIndex}:${value}}`);
                
                if (!hasTabStops) {
                    hasTabStops = true;
                    // Calculate position after the = sign
                    firstValuePosition = currentPosition + keyPart.length;
                }
                
                tabStopIndex++;
            } else {
                snippetLines.push(line);
            }
        } else {
            snippetLines.push(line);
        }
        
        currentPosition += line.length + 1; // +1 for newline
    }
    
    return {
        content: content,
        snippetContent: snippetLines.join('\n'),
        hasTabStops: hasTabStops,
        firstValuePosition: firstValuePosition
    };
}

export function deactivate() {}