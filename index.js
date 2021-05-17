const readline = require("readline");
const request = require('request');
const crypto = require('crypto');

const district_ids = require('./districts.json');
console.log(district_ids["Indore"])
const config = {
    mobile: 8319401394, // format 10-digit number
    date: "17-05-2021", // format dd-mm-yyyy only
    district_id: district_ids["Indore"],   // Indore - change this for your district
    center_id: []     // IMPORTANT that you specify the array of center_id to choose from
                                            // otherwise any available center from district will be booked.
}


let cowinApi = {
    isAuthenticated: false,
    token: "",
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
                    "beneficiaries": beneficiaries
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

}

cowinApi.generateMobileOTP().then(data => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("Enter OTP (expires in 3 mins): ", function (otp) {
        rl.close();
        cowinApi.validateMobileOtp(otp, data.txnId).then(data => {
            console.log("Authenticated");
            start();
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
            try {
                response = await cowinApi.findByDistrict();
                console.log(response);
                let sessions = response.sessions.filter(session => {
                if(config.center_id.length == 0) {
                    return session.available_capacity_dose1 > 0 && session.min_age_limit == 18
                } else {
                    return session.available_capacity_dose1 > 0 && session.min_age_limit == 18 && config.center_id.includes(session.center_id);
                }
            });
            console.log(sessions);
            console.log(`Total session available: `, sessions.length);

            for (let session of sessions) {
                try {
                    let response = await cowinApi.schedule(session.session_id, session.slot[0], beneficiaries);
                    if (response.appointment_id != undefined) {
                        console.log('Booked');
                        console.log(response);
                        clearInterval(interval);
                        break;
                    }
                } catch (error) {
                    console.log(error);
                    if(error.message == "Unauthenticated") {
                        console.log("Please rerun utility");
                    }
                }
                }

            } catch (error) {
                console.log(error);
                if (error.message == "Unauthenticated") {
                    console.log("Please rerun utility");
                }
            }
        }, 3000)



    } catch (error) {
        console.log(error);
    }
}