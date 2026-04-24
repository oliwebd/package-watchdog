UUID ?= package-watchdog@oliwebd.github.com
ZIP_FILE ?= $(UUID).shell-extension.zip

.PHONY: all build pack install uninstall clean deploy

all: build

build:
	pnpm install
	pnpm run build

pack:
	pnpm run pack

deploy: pack
	pnpm run deploy

install: deploy

uninstall:
	gnome-extensions disable $(UUID) || true
	gnome-extensions uninstall $(UUID) || true

clean:
	rm -rf dist $(ZIP_FILE) node_modules
