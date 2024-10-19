package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/AlecAivazis/survey/v2"
)

var minSize int64

func init() {
	flag.Int64Var(&minSize, "minsize", 0, "Minimum file size to consider (in bytes)")
}

func main() {
	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		fmt.Println("Usage: ccdupe [--minsize=<size>] <directory>")
		os.Exit(1)
	}

	dir := args[0]
	files, err := scanDirectory(dir)
	if err != nil {
		fmt.Printf("Error scanning directory: %v\n", err)
		os.Exit(1)
	}

	findDuplicates(files)
}

func scanDirectory(dir string) ([]FileInfo, error) {
	var files []FileInfo

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		println("Scanning directory...")
		if err != nil {
			return err
		}
		if !info.IsDir() && info.Size() >= minSize {
			fileInfo, err := getFileInfo(path)
			if err != nil {
				return err
			}
			files = append(files, fileInfo)
		}
		return nil
	})

	return files, err
}

func findDuplicates(files []FileInfo) {
	hashMap := make(map[string][]string)

	for _, file := range files {
		hash, err := calculateMD5(file.Path)
		if err != nil {
			fmt.Printf("Error calculating MD5 for %s: %v\n", file.Path, err)
			continue
		}
		hashMap[hash] = append(hashMap[hash], file.Path)
	}

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
				fmt.Printf("Error comparing files %s and %s: %v\n", paths[i], paths[j], err)
				continue
			}
			if identical {
				fmt.Printf("Duplicates: %s %s\n", paths[i], paths[j])
				deleteFile := promptForDeletion(paths[i], paths[j])
				if deleteFile != "" {
					err := os.Remove(deleteFile)
					if err != nil {
						fmt.Printf("Error deleting file %s: %v\n", deleteFile, err)
					} else {
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
