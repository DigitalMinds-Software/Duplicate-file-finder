package main

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
)

type FileInfo struct {
	Path    string
	Size    int64
	IsLink  bool
	LinkDst string
}

func getFileInfo(path string) (FileInfo, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return FileInfo{}, err
	}

	fileInfo := FileInfo{
		Path: path,
		Size: info.Size(),
	}

	if info.Mode()&os.ModeSymlink != 0 {
		fileInfo.IsLink = true
		fileInfo.LinkDst, err = os.Readlink(path)
		if err != nil {
			return FileInfo{}, err
		}
	}

	return fileInfo, nil
}

func areFilesIdentical(file1, file2 string) (bool, error) {
	f1, err := os.Open(file1)
	if err != nil {
		return false, err
	}
	defer f1.Close()

	f2, err := os.Open(file2)
	if err != nil {
		return false, err
	}
	defer f2.Close()

	const chunkSize = 64 * 1024 // 64KB chunks
	for {
		b1 := make([]byte, chunkSize)
		n1, err1 := f1.Read(b1)

		b2 := make([]byte, chunkSize)
		n2, err2 := f2.Read(b2)

		if err1 != nil || err2 != nil {
			if err1 == io.EOF && err2 == io.EOF {
				return true, nil // Both files reached EOF, they are identical
			}
			if err1 == io.EOF || err2 == io.EOF {
				return false, nil // One file is longer than the other
			}
			if err1 != nil {
				return false, err1
			}
			return false, err2
		}

		if n1 != n2 || !bytes.Equal(b1[:n1], b2[:n2]) {
			return false, nil // Chunks are different
		}
	}
}

func resolveSymlink(path string) (string, error) {
	for {
		info, err := os.Lstat(path)
		if err != nil {
			return "", err
		}

		if info.Mode()&os.ModeSymlink == 0 {
			return path, nil
		}

		linkDst, err := os.Readlink(path)
		if err != nil {
			return "", err
		}

		if !filepath.IsAbs(linkDst) {
			linkDst = filepath.Join(filepath.Dir(path), linkDst)
		}

		path = linkDst
	}
}
