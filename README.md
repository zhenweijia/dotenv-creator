# DotEnv Creator

A VS Code extension that creates `.env` files from templates with a single command.

## Features

- Creates `.env` file from template files (`.env.example`, `.env.template`, `.env.sample`, `.env.dist`)
- Automatically searches for template files in your workspace
- Prompts to add `.env` to `.gitignore` if not already present
- Supports multiple template files with selection dialog

## Usage

1. Open a workspace/folder that contains an `.env` template file
2. Open Command Palette (`Shift+Cmd+P` on macOS or `Shift+Ctrl+P` on Windows/Linux)
3. Type "Create .env from Template" and press Enter
4. If multiple templates exist, select the one you want to use
5. The extension will create a `.env` file and prompt you to add it to `.gitignore`

## Installation

### Development

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press `F5` in VS Code to launch a new Extension Development Host window
5. Test the extension in the new window

### Building

To create a `.vsix` package:

```bash
npm install -g vsce
vsce package
```

## Supported Template Names

- `.env.example`
- `.env.template`
- `.env.sample`
- `.env.dist`

The extension will search recursively through your workspace for these files.

## License

ISC