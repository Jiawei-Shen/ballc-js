import { BAllC } from "./src/BAllC.js";

async function queryBAllC(filePath, range) {
    const testBallC = new BAllC(filePath);

    const mc_records = await testBallC.query(range);
    const header = await testBallC.getHeader();

    return mc_records;
    // return header;
}

// local test
// const results = await queryBAllC(
//     { path: "/Users/jiaweishen/Downloads/FC_E17a_3C_1-1-I3-F13.cz" },
//     "chr1:0-5000000"
// );

//remote test
const results = await queryBAllC(
    { url: "https://wangftp.wustl.edu/~dli/ballc/ballc/HBA_200622_H1930001_A46_1_P2-1-F3-K1.ballc" },
    "chr7:26733027-27694134"
);

console.log(results);
