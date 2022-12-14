// "it" function defines the test case
export const it = (desc, func) => {
  //encapsulate the func call in try/catch block so that testing does not stop if one test fails
  try {
    func();
    // If the test case passes then log the test case description in the browser console with a checkmark
    console.log("\x1b[32m%s\x1b[0m", "\u2714 " + desc);
  } catch (error) {
    // If the test case fails then log the test case description in the browser console with an 'x'
    // wrap in setTimeout so that the error is logged after the test all succcessful tests
    setTimeout(() => {
      // log the error on the console with an 'x'
      console.log("\n");
      console.log("\x1b[31m%s\x1b[0m", "\u2718 " + desc);
      console.error(error);
      console.log("\n");
    }, 0);
  }
};

export const assert = (isTrue) => {
  if (!isTrue) {
    throw new Error();
  }
};