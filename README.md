# llm-radio-node-cli

## Setup

1. Install [pnpm](https://pnpm.io/installation#using-a-standalone-script) using standalone script
   - You can use `pnpm env` to switch between Node.js versions by pnpm if you install by standalone script
2. Restart your terminal app
3. Install Node.js v20 (LTS) `pnpm env use --global lts`
4. Install corepack `pnpm add -g corepack`
5. Clone this repository `git clone https://github.com/nae-lab/llm-radio-node-cli.git`
6. Change directory to the repository `cd llm-radio-node-cli`
7. Set up the environment variables
   - Copy the `.env.example` file to `.env` and fill in the values `cp .env.example .env`
   - Edit the `.env` file to set your API key
8. Install dependencies `pnpm install`

## Usage

Type the following command to get the list of available options:

```sh
pnpm main --help
```

### Example

- You can place your BGM and PDF files at any folder (e.g. `assets/`)

```sh
pnpm main --llm-model="gpt-4o" --tts-concurrency=15 --assistant-concurrency=5 --bgm="assets/podcast-jazz-music.mp3" --bgm-volume=0.25 --minute=15 --papers="assets/Yahagi_et_al_2020_Suppression_of_floating_image_degradation_using_a_mechanical_vibration_of_a.pdf"
```
