# llm-radio-node-cli

## CLI Setup

1. Install [pnpm](https://pnpm.io/installation#using-a-standalone-script) using standalone script
   - You can use `pnpm env` to switch between Node.js versions by pnpm if you install by standalone script
2. Restart your terminal app
3. Install Node.js v20 (LTS) `pnpm env use --global lts`
4. Install corepack `pnpm add -g corepack`
5. Clone this repository `git clone https://github.com/nae-lab/llm-radio-node-cli.git`
6. Change directory to the repository `cd llm-radio-node-cli`
   - Edit the `.env` file to set your API key
8. Install dependencies `pnpm install`

## Setup for server
In addition to the CLI setup, you need to set up the following:

1. Place firebase service account key file at `./paperwave-firebase-adminsdk.json`
2. Set up the environment variables
   - Edit the `.env` file to set your key file path
   - Set firestore collection ids in the `.env` file

## Setup for Docker build

### Pre-requisites

- grep
- cut

### Setup

In addition to the CLI and server setup, you need to set up the following:

1. Set up the environment variables
   - Edit the `.env` file to set your Docker registry (e.g. region-docker.pkg.dev/project-name/repo-name/image-name)

## CLI Usage

Type the following command to get the list of available options:

```sh
pnpm main --help
```

### Example

- You can place your BGM and PDF files at any folder (e.g. `assets/`)

```sh
pnpm main --llm-model="gpt-4o" --tts-concurrency=15 --assistant-concurrency=5 --bgm="assets/podcast-jazz-music.mp3" --bgm-volume=0.25 --minute=15 --papers="assets/Yahagi_et_al_2020_Suppression_of_floating_image_degradation_using_a_mechanical_vibration_of_a.pdf"
```

## Server Usage

```sh
pnpm server --help
```

### Example

```sh
pnpm server --log=debug
```

## Docker build

Before buliding the docker image, you need to **increment the version in the `package.json`** file.

```sh
pnpm docker:build # Build docker image
pnpm docker:push  # Push docker image to registry
# ! create-gce-with-container.sh is not included in the repository!
./scripts/create-gce-with-container.sh dev|production # Create GCE instance with the pushed image
```
