(function(){

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