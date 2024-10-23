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
 * Description: Spinnies configuration
 */

import Spinnies from "spinnies";
import process from "process";

let _spinnies: Spinnies | undefined;
if (process.env.NODE_ENV === "test" || process.env.DOCKER === "true") {
  _spinnies = undefined;
} else {
  _spinnies = new Spinnies({
    sort: true,
  });
}

export const spinnies = _spinnies;
