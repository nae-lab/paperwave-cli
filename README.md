# PaperWave CLI

## Introduction

This repository contains the source code for the PaperWave CLI.
PaperWave was developed as research project.
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

Recommended package manager for PaperWave CLI is pnpm, but you may use other package managers.

1. Install [pnpm](https://pnpm.io/installation#using-a-standalone-script) using standalone script
   - You can use `pnpm env` to switch between Node.js versions by pnpm if you install by standalone script
2. Restart your terminal app
3. Install Node.js v20 (LTS) `pnpm env use --global lts`
4. Install corepack `pnpm add -g corepack`
5. Clone this repository `git clone https://github.com/nae-lab/paperwave-cli.git`
6. Change directory to the repository `cd paperwave-cli`
   - Edit the `.env` file to set your API key
8. Install dependencies `pnpm install`

### CLI Usage

Type the following command to get the list of available options:

```sh
pnpm main --help
```

### CLI Example Command

- You can place your BGM and PDF files at any folder (e.g. `assets/`)

```sh
pnpm main --llm-model="gpt-4o" --tts-concurrency=15 --assistant-concurrency=5 --bgm="assets/podcast-jazz-music.mp3" --bgm-volume=0.25 --minute=15 --papers="assets/Yahagi_et_al_2020_Suppression_of_floating_image_degradation_using_a_mechanical_vibration_of_a.pdf"
```

## Server

### Setup for server

In addition to the CLI setup, you need to set up the following:

1. Place firebase service account key file at `./paperwave-firebase-adminsdk.json`
2. Set up the environment variables
   - Edit the `.env` file to set your key file path
   - Set firestore collection ids in the `.env` file

### Server Usage

```sh
pnpm server --help
```

### Example Command

```sh
pnpm server --log=debug
```

## Docker

You can build and run the PaperWave CLI and server using Docker.

### Setup for Docker build

#### Pre-requisites

- grep
- cut

#### Setup

In addition to the CLI and server setup, you need to set up the following:

1. Set up the environment variables
   - Edit the `.env` file to set your Docker registry (e.g. region-docker.pkg.dev/project-name/repo-name/image-name)

### Docker build

Before buliding the docker image, you need to **increment the version in the `package.json`** file.

```sh
pnpm docker:build # Build docker image
pnpm docker:push  # Push docker image to registry
# ! create-gce-with-container.sh is not included in the repository!
./scripts/create-gce-with-container.sh dev|production # Create GCE instance with the pushed image
```

