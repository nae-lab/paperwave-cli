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
