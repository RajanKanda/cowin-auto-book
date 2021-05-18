const readline = require("readline");
const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const district_ids = require('./districts.json');

const config = {
    mobile: process.env.MOBILE_NUMBER,                  // format 10-digit number
    date: "19-05-2021",                                 // format dd-mm-yyyy only
    district_id: district_ids[process.env.DISTRICT],    // change this for your district
    
    center_id: [658404, 669518, 698085, 618408, 666568, 669412, 570742, 695040, 561406]
    // IMPORTANT that you specify the array of center_id to choose from
    // otherwise any available center from district will be booked.
}
let available_sessions = [];


let cowinApi = {
    isAuthenticated: false,
    token: "",
    captcha: "",
    findByDistrict: function () {
        return new Promise(function (resolve, reject) {
            if (!cowinApi.isAuthenticated) {
                return reject(new Error("Unauthenticated"));
            }
            request({
                'method': 'GET',
                'url': `https://cdn-api.co-vin.in/api/v2/appointment/sessions/findByDistrict?district_id=${config.district_id}&date=${config.date}`,
                'headers': {
                    'Authorization': `Bearer ${cowinApi.token}`
                }
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                if (response.statusCode != 200) {
                    cowinApi.isAuthenticated = false;
                    cowinApi.token = "";
                    return reject(new Error("Unauthenticated"));
                }
                resolve(JSON.parse(response.body));
            });
        });
    },
    generateMobileOTP: function () {
        return new Promise(function (resolve, reject) {
            request({
                'method': 'POST',
                'url': `https://cdn-api.co-vin.in/api/v2/auth/generateMobileOTP`,
                'headers': {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "secret": "U2FsdGVkX18gPDmACz8pCSQ4eqebeCeERm2f2FBkeZ0ELVnIgh32ijt8If7285YScUQah/apTyXEgWwn48m27g==",
                    "mobile": config.mobile
                })
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                resolve(JSON.parse(response.body));
            });
        });
    },
    validateMobileOtp: function (otp, txnId) {
        return new Promise(async function (resolve, reject) {
            request({
                'method': 'POST',
                'url': `https://cdn-api.co-vin.in/api/v2/auth/validateMobileOtp`,
                'headers': {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "otp": crypto.createHash('sha256').update(otp).digest('hex'),
                    "txnId": txnId
                })
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                let data = JSON.parse(response.body);
                cowinApi.isAuthenticated = true;
                cowinApi.token = data.token;
                resolve(data);
            });
        });
    },
    getBeneficiaries: function () {
        return new Promise(function (resolve, reject) {
            if (!cowinApi.isAuthenticated) {
                return reject(new Error("Unauthenticated"));
            }
            request({
                'method': 'GET',
                'url': `https://cdn-api.co-vin.in/api/v2/appointment/beneficiaries`,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cowinApi.token}`
                }
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                if (response.statusCode != 200) {
                    cowinApi.isAuthenticated = false;
                    cowinApi.token = "";
                    console.log(response);
                    return reject(new Error("Unauthenticated"));
                }
                resolve(JSON.parse(response.body));
            });
        });
    },
    schedule: function (session_id, slot, beneficiaries) {
        return new Promise(function (resolve, reject) {
            if (!cowinApi.isAuthenticated) {
                return reject(new Error("Unauthenticated"));
            }
            request({
                'method': 'POST',
                'url': `https://cdn-api.co-vin.in/api/v2/appointment/schedule`,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cowinApi.token}`
                },
                'body': JSON.stringify({
                    "dose": 1,
                    "session_id": session_id,
                    "slot": slot,
                    "beneficiaries": beneficiaries,
                    "captcha": cowinApi.captcha
                  })
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                if (response.statusCode != 200) {
                    cowinApi.isAuthenticated = false;
                    cowinApi.token = "";
                    console.log(response);
                    return reject(new Error("Unauthenticated"));
                }
                resolve(JSON.parse(response.body));
            });
        });
    },
    getRecaptcha: function () {
        return new Promise(function (resolve, reject) {
            if (!cowinApi.isAuthenticated) {
                return reject(new Error("Unauthenticated"));
            }
            request({
                'method': 'POST',
                'url': `https://cdn-api.co-vin.in/api/v2/auth/getRecaptcha`,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cowinApi.token}`
                },
                'body': JSON.stringify({})
            }, function (error, response) {
                if (error) {
                    return reject(error);
                }
                if (response.statusCode != 200) {
                    cowinApi.isAuthenticated = false;
                    cowinApi.token = "";
                    console.log(response);
                    return reject(new Error("Unauthenticated"));
                }
                resolve(JSON.parse(response.body));
            });
        });
    }

}

cowinApi.generateMobileOTP().then(data => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("Enter OTP (expires in 3 mins): ", function (otp) {
        cowinApi.validateMobileOtp(otp, data.txnId).then(data => {
            console.log("Authenticated");
            cowinApi.getRecaptcha().then(data => {
                console.log("Saving ecaptcha");
                fs.writeFileSync('./captcha.svg', data.captcha);
                require('child_process').exec((process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open') + './captcha.svg');
                rl.question("Please enter captcha: ", function(captcha) {
                    rl.close();
                    cowinApi.captcha = captcha;
                    start();
                })
            }).catch(err => {
                console.log(err);
            })
        }).catch(err => {
            console.log(err);
        })
    });
}).catch(err => {
    console.log(err);
});
async function start() {
    try {
        let response = await cowinApi.getBeneficiaries();
        let beneficiaries = response.beneficiaries.map(be => be.beneficiary_reference_id);
        console.log(beneficiaries);
        console.log("Total Beneficiaries: ", beneficiaries.length);

        let interval = setInterval(async function () {
            console.log((new Date()).toLocaleString());
            try {
                response = await cowinApi.findByDistrict();
                // console.log(response);
                let sessions = response.sessions.filter(session => {
                if(config.center_id.length == 0) {
                    return session.available_capacity_dose1 > 0 && session.min_age_limit == 18
                } else {
                    return session.available_capacity_dose1 > 0 && session.min_age_limit == 18 && config.center_id.includes(session.center_id);
                }
            });
            console.log(sessions);
            console.log(`Total session available: `, sessions.length);
            available_sessions.push(sessions);

            for (let session of sessions) {
                try {
                    let response = await cowinApi.schedule(session.session_id, session.slots[0], [beneficiaries[1]]);
                    if (response.appointment_id != undefined) {
                        console.log('Booked');
                        console.log(response);
                        clearInterval(interval);
                        break;
                    }
                } catch (error) {
                    // console.log(error);
                    if(error.message == "Unauthenticated") {
                        console.log("Unauthenticated - Please rerun utility - cant book appointment");
                    }
                }
                }

            } catch (error) {
                // console.log(error);
                if (error.message == "Unauthenticated") {
                    console.log("Unauthenticated - Please rerun utility - cant find sessions");
                }
            }
        }, 5000)



    } catch (error) {
        // console.log(error);
    }
}