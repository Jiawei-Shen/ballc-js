import { BAllC } from "./src/BAllC.js";

async function queryBAllC(filePath, range) {
    const testBallC = new BAllC(filePath);
    console.time("ballcTimer");
    const mc_records = await testBallC.query(range);
    // const header = await testBallC.getHeader();
    console.timeEnd("ballcTimer");
    return mc_records;
    // return header;
}

// local test
const results = await queryBAllC(
    { path: "/Users/jiaweishen/Downloads/ballc_example/HBA_220324_H1930004_BS93_PN_1_P1-1-K15-C14.ballc" },
    // { path: "/Users/jiaweishen/Downloads/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc" },
    "chr1:0-1000000"
);

//remote test
// const results = await queryBAllC(
//     { url: "https://wangftp.wustl.edu/~dli/ballc/ballc/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc" },
//     "chr7:26733027-27694134"
// );

console.log(results);
