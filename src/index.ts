import * as moment from "moment";
import { parse, Node, Reason } from "./dataParse";

(() => {
  let list: Node[] = [];
  const startDate = moment(`2021-12-21`);
  for (let index = 1; index < 13; index++) {
    const result = parse(startDate.clone().add(index, "days"));
    list = list.concat(result);
  }

  const db = list.reduce<Record<string, any>>((pre, cur) => {
    pre[
      `${cur.publishDay.year}${cur.publishDay.month
        .toString()
        .padStart(2)}${cur.publishDay.day.toString().padStart(2)}${cur.nu
        .toString()
        .padStart(2)}`
    ] = cur;
    return pre;
  }, {});

  const getNu = (node: Node) => {
    return `${node.publishDay.format("YYYYMMDD")}-${node.nu
      .toString()
      .padStart(3, "0")}`;
  };

  // 找出所有隔离的人
  const isolateList = list.filter((one) => one.isIsolate);
  // 计算隔离时间
  const isolateStat = isolateList
    .map((one) => {
      const nu = getNu(one);
      // 一级传播
      const infectList = list.filter((t) => {
        if (t.reason === Reason.密切接触) {
          return t.preCC.nu === nu;
        }
        return false;
      });
      // 二级传播
      const infect2List = infectList
        .map((infector) =>
          list.filter((t) => {
            if (t.reason === Reason.密切接触) {
              return t.preCC.nu === getNu(infector);
            }
            return false;
          })
        )
        .reduce((pre, cur) => pre.concat(cur), []);
      // if (infectList.length > 0) {
      //   console.log(
      //     `${getNu(one)}|${one.publishDay.diff(one.isolate, "days")}|${
      //       infectList.length
      //     }|${one.line}`
      //   );
      // }

      return {
        nu: getNu(one),
        days: one.publishDay.diff(one.isolate, "days") - 2,
        one,
        infectList,
        infect2List,
      };
    })
    // .filter((one) => one.infectList.length !== 0)
    // .filter((one) => one.infect2List.length !== 0)
    // .sort((a, b) => a.infect2List.length - b.infect2List.length)
    .sort((a, b) => a.days - b.days)
    .map((one) => {
      //
      //   console.log(
      //     `${one.nu}|${one.days}|${one.infectList.length}|${
      //       one.infect2List.length
      //     }|${one.one.line}|${JSON.stringify({
      //       first: one.infectList,
      //       second: one.infect2List,
      //     })}`
      //   );

      //   计算隔离时间;
      console.log(`${one.nu}|${one.days}|${one.one.line}`);
    });
})();
