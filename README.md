## Duplicate File Finder 

https://codingchallenges.fyi/challenges/challenge-duplicate-files/

A smart tool that can scan a directory to identify and remove duplicate files.

It's available in two modes:
- CLI
- WEB

* CLI
````
go run . --minsize=1000 --follow-symlinks DIRECTORY_PATH
````

* WEB
````
go run . --web
````