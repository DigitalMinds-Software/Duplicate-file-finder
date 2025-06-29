## Duplicate File Finder 

https://codingchallenges.fyi/challenges/challenge-duplicate-files/

A smart tool that can scan a directory to identify and remove duplicate files.

It's available in three modes: CLI, Web, and Desktop

* CLI
````
go run . --minsize=1000 --follow-symlinks DIRECTORY_PATH
````

* Web
````
go run . --web
````

* Desktop (Electron)
````
go run . --desktop
````

## Desktop Mode Setup

For the desktop mode, you'll need Node.js and npm installed:

1. Install Node.js from https://nodejs.org/
2. Run the desktop application:
   ````
   go run . --desktop
   ````

The desktop mode will automatically:
- Install npm dependencies if needed
- Build the Go executable
- Launch the Electron desktop application