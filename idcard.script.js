(function(){

/* =====================================================
   CEZOO DELIVERY PARTNER ID CARD
   Separate JS — CSS injected from this file
===================================================== */

const ID_CARD_SUPABASE_URL =
    "https://ycqwdeiykbkfmmlpgdzd.supabase.co";

const ID_CARD_SUPABASE_KEY =
    "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const idCardSupabase =
    window.supabase.createClient(
        ID_CARD_SUPABASE_URL,
        ID_CARD_SUPABASE_KEY
    );


let idCardInjected = false;
let idCardFlipped = false;


/* =====================================================
   HELPERS
===================================================== */

function getIdCardPartnerMobile(){

    return String(
        localStorage.getItem(
            "partner_mobile"
        ) || ""
    )
    .replace(/\D/g,"")
    .trim();
}


function escapeIdCardHtml(value){

    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}


/* =====================================================
   CSS
===================================================== */

function injectIdCardCss(){

    if(
        document.getElementById(
            "cezooIdCardStyles"
        )
    ){
        return;
    }

    const style =
        document.createElement(
            "style"
        );

    style.id =
        "cezooIdCardStyles";

    style.textContent = `

/* =====================================================
   CEZOO ID CARD BOTTOM SHEET
===================================================== */

#orderPage .cezooIdOverlay{
    position:fixed;
    inset:0;
    z-index:9500;

    display:flex;
    align-items:flex-end;
    justify-content:center;

    padding-top:var(--safe-top);

    background:rgba(15,23,42,.52);

    opacity:0;
    visibility:hidden;
    pointer-events:none;

    transition:
        opacity .24s ease,
        visibility .24s ease;
}

#orderPage .cezooIdOverlay.open{
    opacity:1;
    visibility:visible;
    pointer-events:auto;
}


#orderPage .cezooIdSheet{
    width:100%;
    max-width:560px;

    padding:
        10px
        18px
        calc(26px + var(--safe-bottom));

    border-radius:28px 28px 0 0;

    background:
        linear-gradient(
            180deg,
            #ffffff,
            #f8fafc
        );

    box-shadow:
        0 -18px 50px rgba(15,23,42,.22);

    transform:translateY(105%);

    transition:
        transform .32s cubic-bezier(.22,.8,.32,1);
}


#orderPage .cezooIdOverlay.open .cezooIdSheet{
    transform:translateY(0);
}


#orderPage .cezooIdHandle{
    width:44px;
    height:5px;

    margin:
        0
        auto
        14px;

    border-radius:999px;

    background:#d1d5db;
}


#orderPage .cezooIdSheetHeader{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;

    margin-bottom:18px;
}


#orderPage .cezooIdSheetHeader h2{
    margin:0;

    color:#111827;

    font-size:18px;
    font-weight:800;
}


#orderPage .cezooIdClose{
    width:38px;
    height:38px;

    border:none;
    border-radius:50%;

    display:flex;
    align-items:center;
    justify-content:center;

    background:#f1f5f9;
    color:#334155;

    font-size:15px;

    cursor:pointer;
}


/* =====================================================
   3D CARD
===================================================== */

#orderPage .cezooIdScene{
    width:100%;
    max-width:365px;

    margin:
        4px
        auto
        12px;

    perspective:1200px;
}


#orderPage .cezooIdCard{
    position:relative;

    width:100%;
    aspect-ratio:1.58/1;

    transform-style:preserve-3d;

    transition:
        transform
        .65s
        cubic-bezier(.2,.75,.25,1);

    cursor:pointer;

    -webkit-tap-highlight-color:transparent;
}


#orderPage .cezooIdCard.flipped{
    transform:rotateY(180deg);
}


#orderPage .cezooIdFace{
    position:absolute;
    inset:0;

    padding:20px;

    border-radius:24px;

    overflow:hidden;

    backface-visibility:hidden;
    -webkit-backface-visibility:hidden;

    box-shadow:
        0 18px 42px rgba(15,23,42,.19);

    border:1px solid rgba(255,255,255,.55);
}


/* =====================================================
   FRONT
===================================================== */

#orderPage .cezooIdFront{
    display:flex;
    flex-direction:column;

    color:#fff;

    background:
        radial-gradient(
            circle at 85% 12%,
            rgba(255,255,255,.24),
            transparent 30%
        ),
        linear-gradient(
            145deg,
            #16a34a 0%,
            #15803d 58%,
            #14532d 100%
        );
}


#orderPage .cezooIdFront::after{
    content:"";
    position:absolute;
    right:-45px;
    bottom:-55px;

    width:180px;
    height:180px;

    border-radius:50%;

    border:
        22px solid
        rgba(255,255,255,.07);
}


#orderPage .cezooIdTop{
    position:relative;
    z-index:2;

    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:14px;
}


#orderPage .cezooIdLogo{
    font-family:"Bungee",Inter,sans-serif;
    font-size:25px;
    letter-spacing:.5px;
}


#orderPage .cezooIdVerified{
    display:inline-flex;
    align-items:center;
    gap:6px;

    padding:6px 9px;

    border-radius:999px;

    background:rgba(255,255,255,.17);

    color:#fff;

    font-size:10px;
    font-weight:800;

    backdrop-filter:blur(10px);
}


#orderPage .cezooIdVerified i{
    font-size:12px;
}


#orderPage .cezooIdRole{
    position:relative;
    z-index:2;

    margin-top:18px;

    color:rgba(255,255,255,.82);

    font-size:10px;
    font-weight:700;

    letter-spacing:1.2px;

    text-transform:uppercase;
}


#orderPage .cezooIdPartnerName{
    position:relative;
    z-index:2;

    margin-top:5px;

    max-width:85%;

    color:#fff;

    font-size:22px;
    line-height:1.18;
    font-weight:900;

    overflow-wrap:anywhere;
}


#orderPage .cezooIdFrontBottom{
    position:relative;
    z-index:2;

    margin-top:auto;

    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:12px;
}


#orderPage .cezooIdMobileLabel{
    display:block;

    margin-bottom:3px;

    color:rgba(255,255,255,.68);

    font-size:8px;
    font-weight:700;

    text-transform:uppercase;
}


#orderPage .cezooIdMobile{
    color:#fff;

    font-size:12px;
    font-weight:800;
}


#orderPage .cezooIdPowered{
    max-width:145px;

    text-align:right;

    color:rgba(255,255,255,.74);

    font-size:8px;
    line-height:1.4;
    font-weight:600;
}


/* =====================================================
   BACK
===================================================== */

#orderPage .cezooIdBack{
    transform:rotateY(180deg);

    display:flex;
    flex-direction:column;

    color:#111827;

    background:
        linear-gradient(
            145deg,
            #ffffff,
            #f0fdf4
        );
}


#orderPage .cezooIdBackTitle{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;

    margin-bottom:16px;
}


#orderPage .cezooIdBackLogo{
    font-family:"Bungee",Inter,sans-serif;

    color:#16a34a;

    font-size:23px;
}


#orderPage .cezooIdBackVerified{
    width:29px;
    height:29px;

    border-radius:50%;

    display:flex;
    align-items:center;
    justify-content:center;

    background:#dcfce7;
    color:#16a34a;

    font-size:14px;
}


#orderPage .cezooIdInfoList{
    display:flex;
    flex-direction:column;
    gap:9px;
}


#orderPage .cezooIdInfoRow{
    display:flex;
    align-items:flex-start;
    gap:10px;

    padding:9px 10px;

    border-radius:12px;

    background:#fff;

    border:1px solid #e5e7eb;
}


#orderPage .cezooIdInfoIcon{
    width:28px;
    height:28px;

    flex-shrink:0;

    border-radius:9px;

    display:flex;
    align-items:center;
    justify-content:center;

    background:#ecfdf3;
    color:#16a34a;

    font-size:12px;
}


#orderPage .cezooIdInfoText span{
    display:block;

    margin-bottom:2px;

    color:#94a3b8;

    font-size:8px;
    font-weight:700;

    text-transform:uppercase;
}


#orderPage .cezooIdInfoText strong{
    display:block;

    color:#111827;

    font-size:10px;
    line-height:1.4;
    font-weight:800;

    overflow-wrap:anywhere;
}


#orderPage .cezooIdBackFooter{
    margin-top:auto;

    color:#64748b;

    font-size:8px;
    line-height:1.4;
    font-weight:600;

    text-align:center;
}


/* =====================================================
   FOOTER HINT
===================================================== */

#orderPage .cezooIdHint{
    margin-top:15px;

    display:flex;
    align-items:center;
    justify-content:center;
    gap:7px;

    color:#64748b;

    font-size:10px;
    font-weight:700;
}


#orderPage .cezooIdHint i{
    color:#16a34a;
}


@media (max-width:380px){

    #orderPage .cezooIdFace{
        padding:17px;
    }

    #orderPage .cezooIdPartnerName{
        font-size:19px;
    }

    #orderPage .cezooIdInfoRow{
        padding:7px 8px;
    }

}

    `;

    document.head.appendChild(
        style
    );
}


/* =====================================================
   BUILD SHEET
===================================================== */

function buildIdCardUi(){

    if(
        document.getElementById(
            "cezooIdOverlay"
        )
    ){
        return;
    }

    const overlay =
        document.createElement(
            "div"
        );

    overlay.id =
        "cezooIdOverlay";

    overlay.className =
        "cezooIdOverlay";

    overlay.innerHTML = `

        <div
            class="cezooIdSheet"
            role="dialog"
            aria-modal="true"
            aria-label="Delivery Partner ID Card"
        >

            <div class="cezooIdHandle"></div>


            <div class="cezooIdSheetHeader">

                <h2>
                    Delivery Partner ID
                </h2>

                <button
                    class="cezooIdClose"
                    type="button"
                    aria-label="Close ID Card"
                    onclick="closeDeliveryPartnerIDCard()"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>


            <div class="cezooIdScene">

                <div
                    class="cezooIdCard"
                    id="cezooIdCard"
                    role="button"
                    tabindex="0"
                    aria-label="Tap to flip ID card"
                >

                    <div
                        class="
                            cezooIdFace
                            cezooIdFront
                        "
                    >

                        <div class="cezooIdTop">

                            <div class="cezooIdLogo">
                                CEZOO
                            </div>

                            <div class="cezooIdVerified">
                                <i class="
                                    fa-solid
                                    fa-circle-check
                                "></i>

                                Verified
                            </div>

                        </div>


                        <div class="cezooIdRole">
                            Delivery Partner
                        </div>


                        <div
                            class="cezooIdPartnerName"
                            id="cezooIdPartnerName"
                        >
                            Delivery Partner
                        </div>


                        <div class="cezooIdFrontBottom">

                            <div>
                                <span
                                    class="cezooIdMobileLabel"
                                >
                                    Mobile
                                </span>

                                <strong
                                    class="cezooIdMobile"
                                    id="cezooIdMobile"
                                >
                                    +91 —
                                </strong>
                            </div>


                            <div class="cezooIdPowered">
                                Powered by
                                <br>
                                Cezonal Solutions Private Limited
                            </div>

                        </div>

                    </div>


                    <div
                        class="
                            cezooIdFace
                            cezooIdBack
                        "
                    >

                        <div class="cezooIdBackTitle">

                            <div class="cezooIdBackLogo">
                                CEZOO
                            </div>

                            <div class="cezooIdBackVerified">
                                <i class="
                                    fa-solid
                                    fa-check
                                "></i>
                            </div>

                        </div>


                        <div class="cezooIdInfoList">


                            <div class="cezooIdInfoRow">

                                <div class="cezooIdInfoIcon">
                                    <i class="
                                        fa-solid
                                        fa-location-dot
                                    "></i>
                                </div>

                                <div class="cezooIdInfoText">
                                    <span>
                                        Office Address
                                    </span>

                                    <strong>
                                        Tanuku V Max Opposite,
                                        2nd Floor,
                                        Tanuku
                                    </strong>
                                </div>

                            </div>


                            <div class="cezooIdInfoRow">

                                <div class="cezooIdInfoIcon">
                                    <i class="
                                        fa-solid
                                        fa-envelope
                                    "></i>
                                </div>

                                <div class="cezooIdInfoText">
                                    <span>
                                        Support Email
                                    </span>

                                    <strong>
                                        support@cezoo.co.in
                                    </strong>
                                </div>

                            </div>


                            <div class="cezooIdInfoRow">

                                <div class="cezooIdInfoIcon">
                                    <i class="
                                        fa-solid
                                        fa-phone
                                    "></i>
                                </div>

                                <div class="cezooIdInfoText">
                                    <span>
                                        Support
                                    </span>

                                    <strong>
                                        +91 9344768947
                                    </strong>
                                </div>

                            </div>


                        </div>


                        <div class="cezooIdBackFooter">
                            This card identifies an approved
                            CEZOO Delivery Partner.
                            <br>
                            Cezonal Solutions Private Limited
                        </div>

                    </div>

                </div>

            </div>


            <div class="cezooIdHint">
                <i class="
                    fa-solid
                    fa-arrows-rotate
                "></i>

                Tap the card to flip
            </div>

        </div>
    `;


    document.body.appendChild(
        overlay
    );


    overlay.addEventListener(
        "click",
        function(event){

            if(
                event.target ===
                overlay
            ){
                closeDeliveryPartnerIDCard();
            }
        }
    );


    const card =
        document.getElementById(
            "cezooIdCard"
        );


    card?.addEventListener(
        "click",
        flipDeliveryPartnerIDCard
    );


    card?.addEventListener(
        "keydown",
        function(event){

            if(
                event.key === "Enter" ||
                event.key === " "
            ){

                event.preventDefault();

                flipDeliveryPartnerIDCard();
            }
        }
    );
}


/* =====================================================
   LOAD PARTNER DATA
===================================================== */

async function getIdCardPartnerData(){

    const mobile =
        getIdCardPartnerMobile();

    let name =
        String(
            localStorage.getItem(
                "partner_full_name"
            ) || ""
        ).trim() ||
        "Delivery Partner";

    if(!mobile){
        return {
            name,
            mobile:""
        };
    }

    /*
      Prefer the already-loaded profile name first.
    */
    const visibleProfileName =
        document
            .getElementById(
                "profileName"
            )
            ?.textContent
            ?.trim();

    if(
        visibleProfileName &&
        visibleProfileName !==
            "Delivery Partner"
    ){
        name =
            visibleProfileName;
    }


    try{

        const {data,error} =
            await idCardSupabase
                .from(
                    "delivery_partner_applications"
                )
                .select(
                    "name,mobile,status,created_at"
                )
                .eq(
                    "mobile",
                    mobile
                )
                .order(
                    "created_at",
                    {
                        ascending:false
                    }
                )
                .limit(1)
                .maybeSingle();


        if(!error && data){

            if(
                String(
                    data.name || ""
                ).trim()
            ){
                name =
                    String(
                        data.name
                    ).trim();
            }
        }

    }catch(error){

        console.warn(
            "ID card partner load error:",
            error
        );
    }


    return {
        name,
        mobile
    };
}


/* =====================================================
   OPEN / CLOSE / FLIP
===================================================== */

window.openDeliveryPartnerIDCard =
async function(){

    injectIdCardCss();
    buildIdCardUi();

    const overlay =
        document.getElementById(
            "cezooIdOverlay"
        );

    if(!overlay){
        return;
    }


    /*
      Close profile drawer first.
    */
    document
        .getElementById(
            "profileOverlay"
        )
        ?.classList.remove(
            "open"
        );


    idCardFlipped = false;

    document
        .getElementById(
            "cezooIdCard"
        )
        ?.classList.remove(
            "flipped"
        );


    overlay.classList.add(
        "open"
    );

    document.body.style.overflow =
        "hidden";


    const partner =
        await getIdCardPartnerData();


    const nameElement =
        document.getElementById(
            "cezooIdPartnerName"
        );

    const mobileElement =
        document.getElementById(
            "cezooIdMobile"
        );


    if(nameElement){

        nameElement.textContent =
            partner.name ||
            "Delivery Partner";
    }


    if(mobileElement){

        mobileElement.textContent =
            partner.mobile
                ? "+91 " +
                    partner.mobile
                : "+91 —";
    }
};


window.closeDeliveryPartnerIDCard =
function(){

    document
        .getElementById(
            "cezooIdOverlay"
        )
        ?.classList.remove(
            "open"
        );

    document.body.style.overflow =
        "";

    idCardFlipped = false;

    document
        .getElementById(
            "cezooIdCard"
        )
        ?.classList.remove(
            "flipped"
        );
};


window.flipDeliveryPartnerIDCard =
function(){

    const card =
        document.getElementById(
            "cezooIdCard"
        );

    if(!card){
        return;
    }


    idCardFlipped =
        !idCardFlipped;


    card.classList.toggle(
        "flipped",
        idCardFlipped
    );
};


/*
  Backward-compatible alias in case old HTML is cached.
*/
window.openIDCard =
    window.openDeliveryPartnerIDCard;


/* =====================================================
   PRELOAD CSS + UI
===================================================== */

function initDeliveryPartnerIDCard(){

    injectIdCardCss();
    buildIdCardUi();
}


if(
    document.readyState ===
        "loading"
){

    document.addEventListener(
        "DOMContentLoaded",
        initDeliveryPartnerIDCard,
        {
            once:true
        }
    );

}else{

    initDeliveryPartnerIDCard();
}

})();