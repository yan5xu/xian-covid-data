import * as fs from "fs";
import * as moment from "moment";

const getNu = (month: number, day: number, nu: number) => {
  const year = month === 12 ? 2021 : 2022;
  return `${year}${month.toString().padStart(2, "0")}${day
    .toString()
    .padStart(2, "0")}-${nu.toString().padStart(3, "0")}`;
};

const getDayAndMonth = (str: string): moment.Moment => {
  const monthIndex = str.indexOf("月");
  let year = 2021,
    month = 0,
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
  if (month !== 12) {
    year = 2022;
  }

  return moment(
    `${year}${month.toString().padStart(2)}${day.toString().padStart(2)}`
  );
};

const getCityContryDistrict = (str: string): Address => {
  const cityIndex = str.indexOf("市");
  const countryIndex = str.indexOf("县");
  const districtIndex = str.indexOf("区");
  const city = str.slice(0, cityIndex),
    country = countryIndex > -1 ? str.slice(cityIndex + 1, countryIndex) : "",
    disctrict =
      districtIndex > -1 ? str.slice(districtIndex + 1, districtIndex) : "";

  return { city, country, disctrict } as any;
};

const lineParse = (line: string, index: number, date: moment.Moment): Node => {
  const year = parseInt(date.format("YYYY"));
  const month = parseInt(date.format("MM"));
  const day = parseInt(date.format("DD"));
  const preDate = date.clone().subtract(1, "days");

  try {
    let info: Node = {
      line,
      nu: 0,
      gender: Gender.Empty,
      checkDay: undefined,
      publishDay: undefined,
      reason: Reason.其他原因,
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
    info.gender = params[1] as Gender;
    if (info.gender !== "男" && info.gender !== "女") {
      console.error(`性别获取失败 ${index} ${line}`);
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
      info.reason = Reason.密切接触;
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
        nu: getNu(preCCMonth, preCCDay, preCCNu),
      };
    }
    if (isScreen) {
      info.reason = Reason.核酸筛查;
      const isAbnormal = line.indexOf("检测异常") > -1;
      info.isAbnormal = isAbnormal;
    }

    if (isSomeOneElse) {
      info.reason = Reason.区域确诊;
      info.areaType =
        line.indexOf("生活区域") > -1
          ? AreaType.生活区域
          : line.indexOf("工作区域") > -1
          ? AreaType.工作区域
          : AreaType.Empty;
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
    info.checkDay = preDate;
    //发布日期
    info.publishDay = date;
    //诊断类型
    const diagnosedParams = params.filter((one) => one.indexOf("诊断") > -1)[0];
    info.diagnosed = (
      diagnosedParams.indexOf("（") > -1
        ? diagnosedParams.split("（")[1].split("）")[0]
        : ""
    ) as Diagnosed;

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

export interface Node {
  line: string;
  nu: number;
  gender: Gender;
  age?: number;
  address?: Address;
  isIsolate?: boolean;
  isKeyPerson?: boolean;
  reason: Reason;
  preCC?: PreCC;
  isConcentrated?: boolean;
  isolate?: moment.Moment;
  checkDay: moment.Moment;
  publishDay: moment.Moment;
  diagnosed?: Diagnosed;
  isAbnormal?: boolean;
  areaType?: AreaType;
}

export interface Address {
  city?: City;
  country?: Country;
  disctrict?: string;
}

export enum City {
  现住西安鄠邑 = "现住西安鄠邑",
  现住西安雁塔 = "现住西安雁塔",
  现居住西安长安 = "现居住西安长安",
  现居咸阳兴平 = "现居咸阳兴平",
  现居咸阳泾阳 = "现居咸阳泾阳",
  现居咸阳渭城 = "现居咸阳渭城",
  现居咸阳渭城区居住地12月27日0时34分订正为西安 = "现居咸阳渭城区（居住地12月27日0时34分订正为西安",
  现居咸阳秦都 = "现居咸阳秦都",
  现居延安宝塔 = "现居延安宝塔",
  现居渭南蒲城 = "现居渭南蒲城",
  现居西安临潼 = "现居西安临潼",
  现居西安新城 = "现居西安新城",
  现居西安未央 = "现居西安未央",
  现居西安未央区经开 = "现居西安未央区经开",
  现居西安灞桥 = "现居西安灞桥",
  现居西安灞桥区国际港务 = "现居西安灞桥区国际港务",
  现居西安灞桥区浐灞生态 = "现居西安灞桥区浐灞生态",
  现居西安现居西安 = "现居西安现居西安",
  现居西安碑林 = "现居西安碑林",
  现居西安莲湖 = "现居西安莲湖",
  现居西安西咸新 = "现居西安西咸新",
  现居西安西咸新区沣东新 = "现居西安西咸新区沣东新",
  现居西安鄠邑 = "现居西安鄠邑",
  现居西安长安 = "现居西安长安",
  现居西安阎良 = "现居西安阎良",
  现居西安雁塔 = "现居西安雁塔",
  现居西安雁塔区曲江新 = "现居西安雁塔区曲江新",
  现居西安高 = "现居西安高",
  现居西安高新 = "现居西安高新",
  经级专家组诊断为新冠肺炎确诊病例轻型 = "经级专家组诊断为新冠肺炎确诊病例（轻型",
  西安长安 = "西安长安",
}

export enum Country {
  Empty = "",
  现居咸阳泾阳 = "现居咸阳泾阳",
  现居渭南蒲城 = "现居渭南蒲城",
}

export enum AreaType {
  工作区域 = "工作区域",
  生活区域 = "生活区域",
  Empty = "",
}

export interface Day {
  year: number;
  month: number;
  day: number;
}

export enum Diagnosed {
  Empty = "",
  普通型 = "普通型",
  轻型 = "轻型",
}

export enum Gender {
  Empty = "",
  女 = "女",
  男 = "男",
}

export interface Isolate {
  month?: number;
  day?: number;
}

export interface PreCC {
  publishMonth?: number;
  publishDay?: number;
  nu?: string;
}

export enum Reason {
  其他原因 = "其他原因",
  区域确诊 = "区域确诊",
  密切接触 = "密切接触",
  核酸筛查 = "核酸筛查",
}

export { parse };
