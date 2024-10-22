package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
)

type ScanRequest struct {
	Directory      string `json:"directory"`
	MinSize        string `json:"minSize"`
	FollowSymlinks bool   `json:"followSymlinks"`
}

type ScanResponse struct {
	Results [][]string `json:"results"`
	Error   string     `json:"error,omitempty"`
}

type DeleteRequest struct {
	File string `json:"file"`
}

type DeleteResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

func launchWebApp() {
	// Serve static files
	fs := http.FileServer(http.Dir("."))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", handleWebApp)
	http.HandleFunc("/scan", handleScan)
	http.HandleFunc("/delete", handleDelete)

	fmt.Println("Web app launched. Open http://localhost:8080 in your browser.")
	LogInfo("Web server started on port 8080")
	LogFatal(http.ListenAndServe(":8080", nil))
}

func handleWebApp(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, "index.html")
}

func handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONResponse(w, ScanResponse{Error: "Invalid request format: " + err.Error()})
		return
	}

	// Validate directory
	if req.Directory == "" {
		sendJSONResponse(w, ScanResponse{Error: "Directory path is required"})
		return
	}

	// Convert minSize to int64
	var minSizeValue int64 = 0
	if req.MinSize != "" {
		var err error
		minSizeValue, err = strconv.ParseInt(req.MinSize, 10, 64)
		if err != nil {
			sendJSONResponse(w, ScanResponse{Error: "Invalid minimum size value"})
			return
		}
	}

	// Set global variables
	minSize = minSizeValue
	followSymlinks = req.FollowSymlinks

	// Scan directory
	files, err := scanDirectory(req.Directory)
	if err != nil {
		sendJSONResponse(w, ScanResponse{Error: "Error scanning directory: " + err.Error()})
		return
	}

	// Find duplicates
	duplicates := findDuplicatesWeb(files)
	sendJSONResponse(w, ScanResponse{Results: duplicates})
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJSONResponse(w, DeleteResponse{Success: false, Error: "Invalid request format"})
		return
	}

	if req.File == "" {
		sendJSONResponse(w, DeleteResponse{Success: false, Error: "File path is required"})
		return
	}

	err := os.Remove(req.File)
	if err != nil {
		sendJSONResponse(w, DeleteResponse{Success: false, Error: "Error deleting file: " + err.Error()})
		return
	}

	LogInfo("Deleted file: %s", req.File)
	sendJSONResponse(w, DeleteResponse{Success: true})
}

func sendJSONResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
	}
}

func findDuplicatesWeb(files []FileInfo) [][]string {
	hashMap := make(map[string][]string)

	for _, file := range files {
		hash, err := calculateMD5(file.Path)
		if err != nil {
			LogError("Error calculating MD5 for %s: %v", file.Path, err)
			continue
		}
		hashMap[hash] = append(hashMap[hash], file.Path)
	}

	var duplicates [][]string
	for _, paths := range hashMap {
		if len(paths) > 1 {
			// Verify the files are actually identical
			var confirmedDuplicates []string
			for i := 0; i < len(paths); i++ {
				isConfirmed := false
				for j := i + 1; j < len(paths); j++ {
					identical, err := areFilesIdentical(paths[i], paths[j])
					if err != nil {
						LogError("Error comparing files %s and %s: %v", paths[i], paths[j], err)
						continue
					}
					if identical {
						isConfirmed = true
						if !contains(confirmedDuplicates, paths[j]) {
							confirmedDuplicates = append(confirmedDuplicates, paths[j])
						}
					}
				}
				if isConfirmed && !contains(confirmedDuplicates, paths[i]) {
					confirmedDuplicates = append(confirmedDuplicates, paths[i])
				}
			}
			if len(confirmedDuplicates) > 1 {
				duplicates = append(duplicates, confirmedDuplicates)
			}
		}
	}

	return duplicates
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
