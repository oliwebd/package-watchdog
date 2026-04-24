UUID ?= package-watchdog@oliwebd.github.com
ZIP_FILE ?= $(UUID).shell-extension.zip

.PHONY: all build pack install clean deploy

all: build

build:
	pnpm install
	pnpm run build

pack:
	pnpm run pack

deploy:
	pnpm run deploy

install: deploy

clean:
	rm -rf dist $(ZIP_FILE) node_modules
