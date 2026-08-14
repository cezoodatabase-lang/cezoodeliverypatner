(function(){

const SUPABASE_URL = "https://ycqwdeiykbkfmmlpgdzd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

const otpInputs =
    document.querySelectorAll("#loginPage .otp-box");

let verifyingOTP = false;

function clearOTP(){
    otpInputs.forEach(input => {
        input.value = "";
        input.setAttribute("value", "");
    });
}

function getVerifyButton(){

    return document.querySelector(
        '#loginPage #otpScreen .otp-btn'
    );
}

function showVerifyLoading(){

    const button = getVerifyButton();

    if(!button) return;

    button.disabled = true;

    button.innerHTML = `
        <span style="
            width:18px;
            height:18px;
            display:inline-block;
            border:2px solid rgba(255,255,255,.45);
            border-top-color:#fff;
            border-radius:50%;
            animation:cezooOtpSpin .7s linear infinite;
        "></span>
    `;
}

function hideVerifyLoading(){

    const button = getVerifyButton();

    if(!button) return;

    button.disabled = false;
    button.innerHTML = "Verify OTP";
}

function ensureSpinnerStyle(){

    if(document.getElementById("cezooOtpSpinnerStyle")){
        return;
    }

    const style =
        document.createElement("style");

    style.id = "cezooOtpSpinnerStyle";

    style.textContent = `
        @keyframes cezooOtpSpin{
            to{
                transform:rotate(360deg);
            }
        }

        #loginPage #otpScreen .otp-btn:disabled{
            opacity:.9;
            cursor:not-allowed;
        }
    `;

    document.head.appendChild(style);
}

function sendOTP(){

    const mobileInput =
        document.querySelector("#loginPage #mobile");

    const mobileBox =
        document.querySelector("#loginPage .mobile-box");

    if(!mobileInput || !mobileBox){
        return;
    }

    let mobile =
        mobileInput.value.trim();

    mobileBox.classList.remove("shake");

    if(!/^[0-9]{10}$/.test(mobile)){

        void mobileBox.offsetWidth;

        mobileBox.classList.add("shake");

        return;
    }

    clearOTP();

    const mobileScreen =
        document.getElementById("mobileScreen");

    const otpScreen =
        document.getElementById("otpScreen");

    if(mobileScreen){
        mobileScreen.style.display = "none";
    }

    if(otpScreen){
        otpScreen.style.display = "block";
    }

    clearOTP();

    document
        .getElementById("otp1")
        ?.focus();
}

async function verifyOTP(){

    if(verifyingOTP){
        return;
    }

    const otpContainer =
        document.querySelector(
            "#loginPage .otp-container"
        );

    const mobileInput =
        document.querySelector(
            "#loginPage #mobile"
        );

    if(!otpContainer || !mobileInput){
        return;
    }

    let otp = "";

    otpInputs.forEach(input => {
        otp += input.value;
    });

    const mobile =
        mobileInput.value.trim();

    otpContainer.classList.remove("shake");

    /*
       FIRST check OTP locally.
       Spinner is not shown for a clearly wrong OTP.
    */
    if(otp !== "123456"){

        void otpContainer.offsetWidth;

        otpContainer.classList.add("shake");

        clearOTP();

        document
            .getElementById("otp1")
            ?.focus();

        return;
    }

    /*
       OTP is correct.
       Now show a small spinner while:
       1. saving OTP verification
       2. checking application status
       3. deciding next page
    */
    verifyingOTP = true;

    showVerifyLoading();

    try{

        const { error } =
            await sb
                .from("otp_verifications")
                .insert([
                    {
                        mobile: mobile,
                        otp_code: "123456",
                        is_verified: true,
                        verified_at:
                            new Date().toISOString()
                    }
                ]);

        if(error){
            throw error;
        }

        localStorage.setItem(
            "partner_mobile",
            mobile
        );

        clearOTP();

        /*
           IMPORTANT:
           app.script.js / verification.script.js
           silently checks Supabase application status.

           No separate "Checking Application" page
           is needed during normal login.
        */
        await window.showPage(
            "verification",
            mobile
        );

    }catch(error){

        console.error(
            "OTP verification error:",
            error
        );

        alert(
            "Unable to verify login: " +
            (
                error?.message ||
                "Please try again."
            )
        );

    }finally{

        verifyingOTP = false;

        hideVerifyLoading();
    }
}

otpInputs.forEach((input,index)=>{

    input.addEventListener(
        "input",
        ()=>{

            input.value =
                input.value
                    .replace(/[^0-9]/g,"");

            if(
                input.value.length === 1 &&
                index < otpInputs.length - 1
            ){

                otpInputs[
                    index + 1
                ].focus();
            }
        }
    );

    input.addEventListener(
        "keydown",
        e=>{

            if(
                e.key === "Backspace" &&
                input.value === "" &&
                index > 0
            ){

                otpInputs[
                    index - 1
                ].focus();
            }
        }
    );
});

window.addEventListener(
    "load",
    ()=>{
        ensureSpinnerStyle();
        clearOTP();
        hideVerifyLoading();
    }
);

window.addEventListener(
    "pageshow",
    ()=>{
        clearOTP();
        hideVerifyLoading();
    }
);

window.addEventListener(
    "beforeunload",
    ()=>{
        clearOTP();
    }
);

window.clearOTP = clearOTP;
window.sendOTP = sendOTP;
window.verifyOTP = verifyOTP;

})();