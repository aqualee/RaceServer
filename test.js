/*let thenable = {
    then: function(resolve, reject) {
        setTimeout(() => {
            console.log("thenable");
            resolve(42);
        }, 1000);
    }
};*/





let promise = new Promise(function(resolve, reject) {
        console.log("Promise");
        setTimeout(() => {
            console.log("resolve");


            let promise2 = new Promise(function(resolve, reject) {
                //console.log("Promise inner");
                setTimeout(() => {
                    console.log("resolve inner");
                    resolve(55);            
                }, 1000);
            
            });


            resolve(promise2);            
        }, 1000);

});
    




promise.then(function(value) {
    console.log(value);
  /*  let newpro = new Promise(function(resolve, reject) {
        setTimeout(() => {
            console.log("resolve2");
            resolve(44);            
        }, 1000);

    });*/
    return 23
}).then(function(value){
    console.log(value);
});
