package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/AlecAivazis/survey/v2"
)

var minSize int64
var followSymlinks bool
var webMode bool
var desktopMode bool
var jsonOutput bool

func init() {
	flag.Int64Var(&minSize, "minsize", 0, "Minimum file size to consider (in bytes)")
	flag.BoolVar(&followSymlinks, "follow-symlinks", false, "Follow symlinks when scanning")
	flag.BoolVar(&webMode, "web", false, "Launch web interface")
	flag.BoolVar(&desktopMode, "desktop", false, "Launch desktop application (Electron)")
	flag.BoolVar(&jsonOutput, "json", false, "Output results in JSON format")
}

func main() {
	flag.Parse()

	if webMode {
		launchWebApp()
		return
	}

	if desktopMode {
		launchDesktopApp()
		return
	}

	args := flag.Args()
	if len(args) < 1 {
		fmt.Println("Usage: ccdupe [--minsize=<size>] [--follow-symlinks] <directory>")
		os.Exit(1)
	}

	dir := args[0]
	files, err := scanDirectory(dir)
	if err != nil {
		LogError("Error scanning directory: %v", err)
		fmt.Printf("Error scanning directory: %v\n", err)
		os.Exit(1)
	}

	LogInfo("Scanned directory %s, found %d files", dir, len(files))
	findDuplicates(files)
}

func scanDirectory(dir string) ([]FileInfo, error) {
	var files []FileInfo

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			LogError("Error accessing path %s: %v", path, err)
			return err
		}

		if !info.IsDir() {
			fileInfo, err := getFileInfo(path)
			if err != nil {
				LogError("Error getting file info for %s: %v", path, err)
				return err
			}

			if fileInfo.IsLink && followSymlinks {
				resolvedPath, err := resolveSymlink(path)
				if err != nil {
					LogError("Error resolving symlink %s: %v", path, err)
					return nil // Skip this symlink
				}
				fileInfo, err = getFileInfo(resolvedPath)
				if err != nil {
					LogError("Error getting file info for resolved symlink %s: %v", resolvedPath, err)
					return nil // Skip this symlink
				}
			}

			if fileInfo.Size >= minSize {
				files = append(files, fileInfo)
			}
		}
		return nil
	})

	return files, err
}

type DuplicateGroup struct {
	Files []string `json:"files"`
	Hash  string   `json:"hash"`
}

type ScanResult struct {
	DuplicateGroups []DuplicateGroup `json:"duplicate_groups"`
	TotalFiles      int              `json:"total_files"`
	TotalDuplicates int              `json:"total_duplicates"`
}

func findDuplicates(files []FileInfo) {
	hashMap := make(map[string][]string)

	for _, file := range files {
		hash, err := calculateMD5(file.Path)
		if err != nil {
			LogError("Error calculating MD5 for %s: %v", file.Path, err)
			if !jsonOutput {
				fmt.Printf("Error calculating MD5 for %s: %v\n", file.Path, err)
			}
			continue
		}
		hashMap[hash] = append(hashMap[hash], file.Path)
	}

	if jsonOutput {
		outputJSON(hashMap, len(files))
	} else {
		outputInteractive(hashMap)
	}
}

func outputJSON(hashMap map[string][]string, totalFiles int) {
	var duplicateGroups []DuplicateGroup
	totalDuplicates := 0

	for hash, paths := range hashMap {
		if len(paths) > 1 {
			// Verify files are actually identical
			var verifiedPaths []string
			for i := 0; i < len(paths)-1; i++ {
				for j := i + 1; j < len(paths); j++ {
					identical, err := areFilesIdentical(paths[i], paths[j])
					if err != nil {
						LogError("Error comparing files %s and %s: %v", paths[i], paths[j], err)
						continue
					}
					if identical {
						if !contains(verifiedPaths, paths[i]) {
							verifiedPaths = append(verifiedPaths, paths[i])
						}
						if !contains(verifiedPaths, paths[j]) {
							verifiedPaths = append(verifiedPaths, paths[j])
						}
					}
				}
			}

			if len(verifiedPaths) > 1 {
				duplicateGroups = append(duplicateGroups, DuplicateGroup{
					Files: verifiedPaths,
					Hash:  hash,
				})
				totalDuplicates += len(verifiedPaths)
			}
		}
	}

	result := ScanResult{
		DuplicateGroups: duplicateGroups,
		TotalFiles:      totalFiles,
		TotalDuplicates: totalDuplicates,
	}

	jsonOutput, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		LogError("Error marshaling JSON: %v", err)
		fmt.Printf("Error marshaling JSON: %v\n", err)
		return
	}

	fmt.Println(string(jsonOutput))
}

func outputInteractive(hashMap map[string][]string) {
	for _, paths := range hashMap {
		if len(paths) > 1 {
			confirmAndDeleteDuplicates(paths)
		}
	}
}

func confirmAndDeleteDuplicates(paths []string) {
	for i := 0; i < len(paths)-1; i++ {
		for j := i + 1; j < len(paths); j++ {
			identical, err := areFilesIdentical(paths[i], paths[j])
			if err != nil {
				LogError("Error comparing files %s and %s: %v", paths[i], paths[j], err)
				fmt.Printf("Error comparing files %s and %s: %v\n", paths[i], paths[j], err)
				continue
			}
			if identical {
				LogInfo("Found duplicates: %s %s", paths[i], paths[j])
				fmt.Printf("Duplicates: %s|%s\n", paths[i], paths[j])
				deleteFile := promptForDeletion(paths[i], paths[j])
				if deleteFile != "" {
					err := os.Remove(deleteFile)
					if err != nil {
						LogError("Error deleting file %s: %v", deleteFile, err)
						fmt.Printf("Error deleting file %s: %v\n", deleteFile, err)
					} else {
						LogInfo("Deleted file: %s", deleteFile)
						fmt.Printf("Deleted: %s\n", deleteFile)
					}
				}
			}
		}
	}
}

func promptForDeletion(file1, file2 string) string {
	options := []string{
		"1) " + file1,
		"2) " + file2,
		"3) Keep both files",
	}

	var selection string
	prompt := &survey.Select{
		Message: "Which file should be deleted?",
		Options: options,
	}
	survey.AskOne(prompt, &selection)

	switch selection {
	case "1) " + file1:
		return file1
	case "2) " + file2:
		return file2
	default:
		return ""
	}
}

func launchDesktopApp() {
	fmt.Println("Starting Desktop Application...")
	LogInfo("Launching desktop application")

	// Check if npm is available
	if !isCommandAvailable("npm") {
		fmt.Println("Error: npm is not installed or not in PATH")
		fmt.Println("Please install Node.js and npm to use the desktop application")
		os.Exit(1)
	}

	// Check if node_modules exists, if not install dependencies
	if _, err := os.Stat("node_modules"); os.IsNotExist(err) {
		fmt.Println("Installing dependencies...")
		cmd := exec.Command("npm", "install")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Printf("Error installing dependencies: %v\n", err)
			os.Exit(1)
		}
	}

	// Build the Go executable for the desktop app
	fmt.Println("Building Go executable...")
	buildCmd := exec.Command("go", "build", "-o", "bin/duplicate-file-finder.exe", ".")
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		fmt.Printf("Error building Go executable: %v\n", err)
		os.Exit(1)
	}

	// Launch Electron
	fmt.Println("Launching Electron application...")
	cmd := exec.Command("npm", "start")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Printf("Error launching desktop application: %v\n", err)
		os.Exit(1)
	}
}

func isCommandAvailable(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}
