(function(){

/*
 * ============================================================
 * CEZOO ANDROID FCM DEVICE TOKEN RECEIVER
 *
 * Android sends the real Firebase token using:
 *   window.onAndroidFcmToken(token)
 * and also dispatches:
 *   cezooFcmToken
 *
 * The token is kept locally first. If the delivery partner has
 * already logged in, it is immediately upserted into Supabase.
 * One row per mobile means a new/re-created token REPLACES the
 * old token for that same mobile number.
 * ============================================================
 */

const CEZOO_DEVICE_TOKEN_SUPABASE_URL =
    "https://ycqwdeiykbkfmmlpgdzd.supabase.co";

const CEZOO_DEVICE_TOKEN_SUPABASE_KEY =
    "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const cezooDeviceTokenSB =
    window.supabase.createClient(
        CEZOO_DEVICE_TOKEN_SUPABASE_URL,
        CEZOO_DEVICE_TOKEN_SUPABASE_KEY
    );

let cezooDeviceTokenSaveBusy = false;
let cezooLastSavedTokenKey = "";

function cleanPartnerMobile(value){
    return String(value || "")
        .replace(/\D/g,"")
        .trim();
}

function getCezooAndroidDeviceToken(){

    return String(
        window.CEZOO_FCM_TOKEN ||
        localStorage.getItem("cezoo_fcm_token") ||
        ""
    ).trim();
}

async function saveCezooDeviceTokenForMobile(mobile){

    const cleanMobile =
        cleanPartnerMobile(mobile);

    const token =
        getCezooAndroidDeviceToken();

    /*
     * Login may complete before Android delivers the token.
     * That is okay: onAndroidFcmToken() below will save it later.
     */
    if(!cleanMobile || !token){
        return {
            saved:false,
            waitingForToken:!token
        };
    }

    const saveKey =
        cleanMobile + "::" + token;

    if(
        cezooDeviceTokenSaveBusy ||
        cezooLastSavedTokenKey === saveKey
    ){
        return {
            saved:
                cezooLastSavedTokenKey === saveKey
        };
    }

    cezooDeviceTokenSaveBusy = true;

    try{

        const { error } =
            await cezooDeviceTokenSB
                .from("delivery_partner_device_tokens")
                .upsert(
                    {
                        mobile: cleanMobile,
                        device_token: token,
                        updated_at:
                            new Date().toISOString()
                    },
                    {
                        onConflict:"mobile"
                    }
                );

        if(error){
            throw error;
        }

        cezooLastSavedTokenKey =
            saveKey;

        console.log(
            "✅ CEZOO device token saved/replaced for:",
            cleanMobile
        );

        return {
            saved:true
        };

    }catch(error){

        console.error(
            "❌ CEZOO device token save failed:",
            error
        );

        return {
            saved:false,
            error:error
        };

    }finally{

        cezooDeviceTokenSaveBusy = false;
    }
}

async function receiveCezooAndroidFcmToken(token){

    const cleanToken =
        String(token || "").trim();

    if(!cleanToken){
        return;
    }

    /*
     * Keep the exact latest Android token.
     */
    window.CEZOO_FCM_TOKEN =
        cleanToken;

    localStorage.setItem(
        "cezoo_fcm_token",
        cleanToken
    );

    console.log(
        "✅ Real Android FCM token received by website:",
        cleanToken
    );

    /*
     * If this user is already logged in, save/replace immediately.
     */
    const mobile =
        cleanPartnerMobile(
            localStorage.getItem(
                "partner_mobile"
            )
        );

    if(mobile){
        await saveCezooDeviceTokenForMobile(
            mobile
        );
    }
}

/*
 * Direct callback used by MainActivity.kt.
 */
window.onAndroidFcmToken =
    receiveCezooAndroidFcmToken;

/*
 * Event fallback used by MainActivity.kt.
 */
window.addEventListener(
    "cezooFcmToken",
    function(event){

        const token =
            event?.detail?.token;

        receiveCezooAndroidFcmToken(
            token
        );
    }
);

window.getCezooAndroidDeviceToken =
    getCezooAndroidDeviceToken;

window.saveCezooDeviceTokenForMobile =
    saveCezooDeviceTokenForMobile;


const map = {
    login: "loginPage",
    document: "documentPage",
    verification: "verificationPage",
    order: "orderPage"
};

window.showPage = async function(name,mobile){

    if(mobile){

        localStorage.setItem(
            "partner_mobile",
            mobile
        );
    }

    /*
       Verification itself checks Supabase.

       verifyOTP() will await this function,
       so the Verify OTP spinner stays visible
       until the application status has actually
       been checked and the correct destination
       has been decided.
    */
    if(
        name === "verification" &&
        typeof window.startVerification
            === "function"
    ){

        return await window.startVerification(
            mobile ||
            localStorage.getItem(
                "partner_mobile"
            )
        );
    }

    document
        .querySelectorAll(".spa-page")
        .forEach(page => {
            page.classList.remove("active");
        });

    const id =
        map[name] || name;

    const page =
        document.getElementById(id);

    if(!page){
        console.error(
            "SPA page not found:",
            id
        );
        return;
    }

    page.classList.add("active");

    window.scrollTo(0,0);

    /*
      When approved/login lands on the order page,
      start the live earnings script after the page is visible.
      earnings.script.js may load after this file, so resolve it
      at call time instead of at parse time.
    */
    if(name === "order"){

        setTimeout(function(){

            if(
                typeof window.startDeliveryPartnerEarnings ===
                "function"
            ){
                window.startDeliveryPartnerEarnings();
            }else if(
                typeof window.refreshDeliveryPartnerEarnings ===
                "function"
            ){
                window.refreshDeliveryPartnerEarnings();
            }

        },0);
    }

    if(name === "document"){

        const input =
            document.querySelector(
                "#documentPage #mobile"
            );

        if(input){

            const verifiedMobile =
                String(
                    mobile ||
                    localStorage.getItem(
                        "partner_mobile"
                    ) ||
                    ""
                )
                .replace(/\D/g,"")
                .trim();

            input.value =
                verifiedMobile;

            input.readOnly =
                true;

            input.setAttribute(
                "aria-readonly",
                "true"
            );
        }
    }

    /*
       Whenever login is opened,
       make sure it starts correctly.
    */
    if(name === "login"){

        const mobileScreen =
            document.getElementById(
                "mobileScreen"
            );

        const otpScreen =
            document.getElementById(
                "otpScreen"
            );

        if(mobileScreen){
            mobileScreen.style.display =
                "block";
        }

        if(otpScreen){
            otpScreen.style.display =
                "none";
        }

        if(
            typeof window.clearOTP
                === "function"
        ){
            window.clearOTP();
        }
    }
};

})();
