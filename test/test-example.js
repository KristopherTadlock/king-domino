import { it, assert } from '/test/test-framework.js';

(function() {
  it('should fail', () => {
    assert(1 !== 1);
  });
  
  it('should pass', () => {
    assert(1 === 1);
  });
})()