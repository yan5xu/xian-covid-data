import * as moment from "moment";
import { parse } from "./dataParse";

(() => {
  let list = [];
  const startDate = moment(`2021-12-21`);
  for (let index = 1; index < 12; index++) {
    const result = parse(startDate.add(1, "days"));
    list = list.concat(result);
  }
})();
