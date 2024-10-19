package main

import (
	"bytes"
	"io"
	"os"
)

type FileInfo struct {
	Path string
	Size int64
}

func getFileInfo(path string) (FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileInfo{}, err
	}
	return FileInfo{
		Path: path,
		Size: info.Size(),
	}, nil
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
