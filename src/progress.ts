/*
 * Copyright 2024 Naemura Laboratory, the University of Tokyo
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Description: Progress bar configuration
 */

import CLIProgress from "cli-progress";
import { spinnies } from "./spinnies";
import { PassThrough } from "stream";
import { randomUUID } from "crypto";

export class SingleBar {
  stream: PassThrough;
  bar: CLIProgress.SingleBar;
  spinnieName: string;

  constructor(
    barOptions?: CLIProgress.Options,
    barPreset?: CLIProgress.Preset
  ) {
    this.spinnieName = randomUUID();
    spinnies?.add(this.spinnieName, { text: "Progress bar" });

    this.stream = new PassThrough();
    this.stream.on("data", (chunk) => {
      spinnies?.update(this.spinnieName, {
        text: chunk.toString(),
      });
    });

    this.bar = new CLIProgress.SingleBar(
      {
        stream: this.stream,
        ...barOptions,
      },
      barPreset || CLIProgress.Presets.shades_classic
    );
  }

  start(total: number, startValue: number, payload?: object) {
    this.bar.start(total, startValue, payload);
    this.bar.setTotal(total);
    this.bar.render();
  }

  stop(spinnieMessage?: string) {
    this.bar.stop();
    spinnies?.succeed(this.spinnieName, {
      text: spinnieMessage || "Task Done.",
    });
    this.stream.end();
  }

  update(current: number, payload?: object) {
    this.bar.update(current, payload);
    this.bar.render();
  }

  increment(step?: number, payload?: object) {
    this.bar.increment(step, payload);
    this.bar.render();
  }
}
