(function(scope){
 'use strict';
 const limits=Object.freeze({perPDF:100,perProfile:300});
 if(typeof module!=='undefined')module.exports=limits;else scope.SMPingCapacity=limits;
})(this);
