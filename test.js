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
// const results = await queryBAllC(
//     // { path: "/Users/jiaweishen/Downloads/DVC210624_P28_VC_B_M_MP2803VC_1-1-B11-B14.ballc" },
//     { path: "/Users/jiaweishen/Downloads/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc" },
//     "chr1:0-1000000"
// );

//remote test
const results = await queryBAllC(
    { url: "https://ftp.ncbi.nlm.nih.gov/pub/geo/DATA/projects/ballc/DVC210624_P28_VC_B_M_MP2803VC_1-1-B11-B14.ballc" },
    // {url: "https://wangftp.wustl.edu/~dli/ballc/ballc/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc"},
    "chr7:26733027-27694134"
);

console.log(results);
