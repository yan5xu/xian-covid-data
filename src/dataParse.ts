import * as fs from "fs";
import * as moment from "moment";

const getDayAndMonth = (str: string) => {
  const monthIndex = str.indexOf("月");
  let month = 0,
    day = 0;
  try {
    month = parseInt(str.slice(monthIndex - 2, monthIndex));
    day = parseInt(str.slice(monthIndex + 1, monthIndex + 3));
  } catch (error) {
    console.error("获取日期失败", str);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`获取隔离日期失败 ${str}`);
  }

  return { month, day };
};

const getCityContryDistrict = (str: string) => {
  const cityIndex = str.indexOf("市");
  const countryIndex = str.indexOf("县");
  const districtIndex = str.indexOf("区");
  const city = str.slice(0, cityIndex),
    country = countryIndex > -1 ? str.slice(cityIndex + 1, countryIndex) : "",
    disctrict =
      districtIndex > -1 ? str.slice(districtIndex + 1, districtIndex) : "";

  return { city, country, disctrict };
};

const lineParse = (line: string, index: number, date: moment.Moment) => {
  const year = parseInt(date.format("YYYY"));
  const month = parseInt(date.format("MM"));
  const day = parseInt(date.format("DD"));
  const preDate = date.clone().subtract(1, "days");

  try {
    let info: Record<string, any> = {
      line,
    };
    const params: string[] = line
      .split("，")
      .reduce((pre, cur) => pre.concat(cur.split("。")), [])
      .reduce((pre, cur) => pre.concat(cur.split(",")), []);
    // Step 3.1 获取编号
    const pre = params[0];
    info.nu = parseInt(pre.slice(6, pre.length));
    if (info.nu !== index + 1) {
      throw new Error(`编号与行号不一致 ${index} ${line}`);
    }
    // Step 3.2 获取性别
    info.gender = params[1];
    if (info.gender !== "男" && info.gender !== "女") {
      console.error(`性别获取失败 ${index} ${line}`);
      info.gender = "";
    }
    // Step 3.3 获取年龄
    info.age = parseInt(params[2].slice(0, params[2].length - 1));
    if (info.age < 0) {
      throw new Error(`年龄获取失败 ${index} ${line}`);
    }
    // Step 3.4 获取地理位置
    const addressParams = params.filter((one) => one.indexOf("市") > -1)[0];
    info.address = getCityContryDistrict(addressParams.replace("市", ""));
    // Step 3.5 确定传染类型
    // Step 3.5.1 确定是否为被隔离人员
    const isScreen = line.indexOf("核酸筛查") > -1;
    const isCloseContact = line.indexOf("密切接触者") > -1;
    const isSomeOneElse =
      line.indexOf("生活区域") > -1 || line.indexOf("工作区域") > -1;
    const firstFlag =
      0 +
      (isScreen ? 1 : 0) +
      (isCloseContact ? 1 : 0) +
      (isSomeOneElse ? 1 : 0);

    info.isIsolate =
      line.indexOf("被隔离") > -1 || line.indexOf("被集中隔离") > -1;
    info.isKeyPerson = line.indexOf("作为重点人员") > -1;

    // 检查分类是否正确
    if (firstFlag > 1) {
      throw new Error(`一级分类失效`);
    }

    if (isCloseContact && line.indexOf("自称为密切接触者") === -1) {
      info.reason = "密切接触";
      // Step 3.5.1.2 上游密接信息
      const preCCParams = params
        .filter((one) => one.indexOf("密切接触") > -1)[0]
        .replace("系", "")
        .replace("为", "")
        .split("的");
      // Step 3.5.1.2.1 上游密接日期
      let preCCMonth = 0,
        preCCDay = 0,
        preCCNuStr = "",
        preCCNu = 0;
      if (
        preCCParams[0].indexOf("月") < 0 ||
        preCCParams[0].indexOf("日") < 0
      ) {
        if (preCCParams[0].slice(0, 6) === "本土确诊病例") {
          preCCDay = day;
          preCCMonth = month;
          preCCNuStr = preCCParams[0];
        } else {
          // TODO 有些没有
          throw new Error(
            `提取密接上游信息失败1 ${index} ${line} ${JSON.stringify(
              preCCParams
            )}`
          );
        }
      } else {
        preCCMonth = parseInt(preCCParams[0].split("月")[0]);
        preCCDay = parseInt(preCCParams[0].split("月")[1].split("日")[0]);
        preCCNuStr = preCCParams[1];
      }
      // Step 3.5.1.2.2 上游密接编号
      preCCNu = parseInt(preCCNuStr.slice(6, preCCNuStr.length));
      if (preCCMonth === 0 || preCCDay === 0 || preCCNu === 0) {
        throw new Error(`提取密接上游信息失败2 ${index} ${line}`);
      }
      info.preCC = {
        publishMonth: preCCMonth,
        publishDay: preCCDay,
        nu: preCCNu,
      };
    }
    if (isScreen) {
      info.reason = "核酸筛查";
      const isAbnormal = line.indexOf("检测异常") > -1;
      info.isAbnormal = isAbnormal;
    }

    if (isSomeOneElse) {
      info.reason = "区域确诊";
      info.areaType =
        line.indexOf("生活区域") > -1
          ? "生活区域"
          : line.indexOf("工作区域") > -1
          ? "工作区域"
          : "";
    }

    if (firstFlag === 0) {
      info.reason = "其他原因";
    }

    if (info.isIsolate) {
      // 隔离日期
      const isolateParams = params.filter(
        (one) => one.indexOf("被隔离") > -1 || one.indexOf("被集中隔离") > -1
      )[0];
      const concludeDate =
        isolateParams.indexOf("日") > -1 && isolateParams.indexOf("月") > -1;

      info.isConcentrated = isolateParams.indexOf("集中隔离") > -1;
      if (concludeDate) {
        try {
          info.isolate = getDayAndMonth(isolateParams);
        } catch (error) {
          throw new Error(`获取隔离日期失败 ${line}`);
        }
      }
    }

    //检出日期
    info.checkDay = {
      year: parseInt(preDate.format("YYYY")),
      month: parseInt(preDate.format("MM")),
      day: parseInt(preDate.format("DD")),
    };
    //发布日期
    info.publishDay = {
      year,
      month,
      day,
    };
    //诊断类型
    const diagnosedParams = params.filter((one) => one.indexOf("诊断") > -1)[0];
    info.diagnosed =
      diagnosedParams.indexOf("（") > -1
        ? diagnosedParams.split("（")[1].split("）")[0]
        : "";

    return info;
  } catch (error) {
    console.log(error, line);
  }
};

const parse = (date: moment.Moment) => {
  const data = fs.readFileSync(`./src/data/${date.format("YYYYMMDD")}`, "utf8");

  // Step 1 清理数据
  let lines: string[] = [];
  // Step 1.1 按行进行切割
  lines = data.split("\n");
  // Step 1.2 去掉空格
  lines = lines.map((line) =>
    line
      .replace(" ", "")
      .replace("　", "")
      .replace("　", "")
      .replace("    ", "")
  );
  // Step 1.3 去掉空行
  lines = lines.filter((line) => line.length !== 0);
  // Step 2 判断数据是否合规
  // Step 2.1 是否已 【本土确诊病例】 作为开头
  lines = lines.filter(
    (line) =>
      line.slice(0, 6) === "本土确诊病例" || line.slice(0, 6) === "本地确诊病例"
  );
  // Step 2.2 编号 与 所处行 是否一致
  lines.map((line, index) => {
    const pre = line.split("，")[0];
    const nu = parseInt(pre.slice(6, pre.length));
    if (nu !== index + 1) {
      console.error("编号与行号不一致", index, line);
    }
  });
  // Step 3 处理数据
  const result = lines.map((line, index) => lineParse(line, index, date));
  return result;
};

export { parse };
