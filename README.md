# PaperWave CLI

Try the demo at https://paperwave.app

## Introduction

This repository contains the source code for the PaperWave CLI.
PaperWave was developed as a research project.
You can read the paper [here](https://arxiv.org/abs/2410.15023).

Webapp is available at [PaperWave Web](https://github.com/nae-lab/paperwave-web).

## Cite this work

> Yuchi Yahagi, Rintaro Chujo, Yuga Harada, Changyo Han, Kohei Sugiyama, and Takeshi Naemura. 2024. PaperWave: Listening to Research Papers as Conversational Podcasts Scripted by LLM.  https://doi.org/10.48550/arXiv.2410.15023

```bibtex
@misc{Yahagi.2024.PaperWaveListeningResearchPapers,
  title = {PaperWave: Listening to Research Papers as Conversational Podcasts Scripted by LLM},
  author = {Yahagi, Yuchi and Chujo, Rintaro and Harada, Yuga and Han, Changyo and Sugiyama, Kohei and Naemura, Takeshi},
  year = {2024},
  number = {arXiv:2410.15023},
  eprint = {2410.15023},
  publisher = {arXiv},
  doi = {10.48550/arXiv.2410.15023},
}
```

## License

LGPL-3.0. See [LICENSE](LICENSE), [COPYING](COPYING), and [COPYING.LESSER](COPYING.LESSER) for more information.


## CLI

### CLI Setup

The recommended package manager for PaperWave CLI is pnpm, but you may use other package managers.

1. Install [pnpm](https://pnpm.io/installation#using-a-standalone-script) using the standalone script
   - You can use `pnpm env` to switch between Node.js versions by pnpm if you install by standalone script
2. Restart your terminal app
3. Install Node.js v20 (LTS) `pnpm env use --global lts`
4. Install corepack `pnpm add -g corepack`
5. Clone this repository `git clone https://github.com/nae-lab/paperwave-cli.git`
6. Change directory to the repository `cd paperwave-cli`
   - Edit the `.env` file to set your API key and other environment variables
7. Install dependencies `pnpm install`

### CLI Usage

To see available options, run:

```sh
pnpm main --help
```

#### Example Command

- You can place your BGM and PDF files in any folder (e.g. `assets/`)

```sh
pnpm main --llm-model="gpt-4o" --tts-concurrency=15 --assistant-concurrency=5 --bgm="assets/podcast-jazz-music.mp3" --bgm-volume=0.25 --minute=15 --papers="assets/Yahagi_et_al_2020_Suppression_of_floating_image_degradation_using_a_mechanical_vibration_of_a.pdf"
```

## Server

### Server Setup

In addition to the CLI setup, you need to:

1. Place the Firebase service account key file at `./paperwave-firebase-adminsdk.json`
2. Set up the environment variables
   - Edit the `.env` file to set your key file path
   - Set Firestore collection IDs in the `.env` file

### Server Usage

```sh
pnpm server --help
```

#### Example Command

```sh
pnpm server --log=debug
```

## Docker

You can build and run the PaperWave CLI and server using Docker.

### Docker Setup

#### Prerequisites

- grep
- cut

#### Setup

In addition to the CLI and server setup, you need to:

1. Set up the environment variables
   - Edit the `.env` file to set your Docker registry (e.g. region-docker.pkg.dev/project-name/repo-name/image-name)

### Docker build

Before building the docker image, you need to **increment the version in the `package.json`** file.

```sh
pnpm docker:build # Build docker image
pnpm docker:push  # Push docker image to registry
# ! create-gce-with-container.sh is not included in the repository!
./scripts/create-gce-with-container.sh dev|production # Create GCE instance with the pushed image
```

## Scripts

### Azure Container Instance Management

- `scripts/create-azure-container.sh` - Create container
- `scripts/azure-container-logs.sh` - View logs
- `scripts/azure-container-status.sh` - View status
- `scripts/azure-container-delete.sh` - Delete container
- `scripts/azure-container-list.sh` - List containers

### Utilities

- `scripts/env-utils.js` - Load and debug environment variables
- `scripts/load-azure-env.sh` - Load common environment variables for Azure scripts

## Environment Variables

Create a `.env` file and set the required environment variables. Example:

```env
# OpenAI API settings
OPENAI_API_KEY=your_openai_api_key

# Azure OpenAI settings
AZURE_SWEDEN_CENTRAL_OPENAI_API_VERSION=2025-01-01-preview
AZURE_SWEDEN_CENTRAL_OPENAI_API_KEY=your_azure_openai_key
AZURE_SWEDEN_CENTRAL_OPENAI_ENDPOINT=https://your-resource.openai.azure.com

# Azure Container Registry settings
ACR_LOGIN_SERVER=your-registry.azurecr.io
ACR_USERNAME=your_username
ACR_PASSWORD=your_password

# Azure settings
AZURE_RESOURCE_GROUP=your-resource-group

# Slack settings
SLACK_TOKEN=your_slack_token
SLACK_ALERT_CHANNEL_ID=your_channel_id
```

## Development

### Run TypeScript

```sh
# Direct execution
npx ts-node src/index.ts

# With arguments
npx ts-node src/index.ts production
```

### Build

```sh
pnpm build
```

