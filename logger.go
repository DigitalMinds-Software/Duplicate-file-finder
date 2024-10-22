package main

import (
	"fmt"
	"log"
	"os"
	"sync"
)

var (
	logger *log.Logger
	once   sync.Once
)

func initLogger() {
	logFile, err := os.OpenFile("ccdupe.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Println("Error opening log file:", err)
		return
	}
	logger = log.New(logFile, "", log.LstdFlags)
}

func GetLogger() *log.Logger {
	once.Do(initLogger)
	return logger
}

func LogInfo(format string, v ...interface{}) {
	if l := GetLogger(); l != nil {
		l.Printf("[INFO] "+format, v...)
	}
}

func LogFatal(v ...any) {
	if l := GetLogger(); l != nil {
		l.Print(v...)
	}
}

func LogError(format string, v ...interface{}) {
	if l := GetLogger(); l != nil {
		l.Printf("[ERROR] "+format, v...)
	}
}
