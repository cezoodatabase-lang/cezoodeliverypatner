(function(){

const SUPABASE_URL = "https://ycqwdeiykbkfmmlpgdzd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";


const sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

let savedMobile = localStorage.getItem("partner_mobile") || "";
let applicationRealtimeChannel = null;
const statusIcon = document.getElementById("statusIcon");
const statusBadge = document.getElementById("statusBadge");
const statusTitle = document.getElementById("statusTitle");
const statusMessage = document.getElementById("statusMessage");
const mobileText = document.getElementById("mobileText");
const statusText = document.getElementById("statusText");
const reviewProgress = document.getElementById("reviewProgress");
const applyBtn = document.getElementById("applyBtn");
const doneBtn = document.getElementById("doneBtn");
const logoutBtn = document.getElementById("logoutBtn");

function activatePage(name){
    const ids = {
        login:"loginPage",
        document:"documentPage",
        verification:"verificationPage",
        order:"orderPage"
    };

    document.querySelectorAll('.spa-page').forEach(p=>p.classList.remove('active'));
    const page = document.getElementById(ids[name] || name);
    if(page) page.classList.add('active');
    window.scrollTo(0,0);
}

function hideAllButtons(){
    applyBtn.style.display = "none";
    doneBtn.style.display = "none";
    logoutBtn.style.display = "none";
}

function resetCheckingUI(){
    statusIcon.className = "status-icon pending";
    statusIcon.innerText = "…";
    statusBadge.innerText = "Checking Status";
    statusTitle.innerText = "Checking Application";
    statusMessage.innerText = "Please wait while we check your latest application status.";
    statusText.innerText = "Loading...";
    reviewProgress.style.display = "flex";
    hideAllButtons();
}

function showPending(){

    activatePage("verification");

    statusIcon.className =
        "status-icon pending tick-loop";

    statusIcon.innerHTML = "✓";

    statusBadge.innerText =
        "Under Review";

    statusTitle.innerText =
        "Verification Pending";

    statusMessage.innerText =
        "Your application has been received. Our team is reviewing your submitted documents.";

    statusText.innerText =
        "PENDING";

    reviewProgress.style.display =
        "flex";

    hideAllButtons();

    logoutBtn.style.display =
        "block";


    // START LIVE STATUS LISTENER
    startApplicationRealtime();
}

function showRejected(){

    activatePage("verification");

    statusIcon.className =
        "status-icon rejected";

    statusIcon.innerText = "×";

    statusBadge.innerText =
        "Action Required";

    statusTitle.innerText =
        "Application Rejected";

    statusMessage.innerText =
        "Your application could not be approved. Please contact CEZOO support.";

    statusText.innerText =
        "REJECTED";

    reviewProgress.style.display =
        "none";

    hideAllButtons();

    logoutBtn.style.display =
        "block";

    startApplicationRealtime();
}
function showProcessing(status){
    activatePage("verification");
    statusIcon.className = "status-icon pending";
    statusIcon.innerText = "…";
    statusBadge.innerText = "Processing";
    statusTitle.innerText = "Application Processing";
    statusMessage.innerText = "Your latest application status is being processed.";
    statusText.innerText = (status || "PROCESSING").toUpperCase();
    reviewProgress.style.display = "flex";
    hideAllButtons();
    logoutBtn.style.display = "block";
}

function showError(message){
    activatePage("verification");
    statusIcon.className = "status-icon rejected";
    statusIcon.innerText = "!";
    statusBadge.innerText = "Unable To Check";
    statusTitle.innerText = "Something Went Wrong";
    statusMessage.innerText = message;
    statusText.innerText = "ERROR";
    reviewProgress.style.display = "none";
    hideAllButtons();
    logoutBtn.style.display = "block";
}

async function fetchLatestApplication(){
    return await sb
        .from("delivery_partner_applications")
        .select("mobile,status,created_at")
        .eq("mobile", savedMobile)
        .order("created_at", { ascending:false })
        .limit(1)
        .maybeSingle();
}

async function checkApplicationStatus(options = {}){
    const showInitialChecking = options.showInitialChecking === true;

    if(showInitialChecking){
        resetCheckingUI();
        activatePage("verification");
    }

    const { data, error } = await fetchLatestApplication();

    if(error){
        showError(error.message);
        return;
    }

    if(!data){
        // No submitted application: go directly to registration.
        window.showPage("document", savedMobile);
        return;
    }

    const status = (data.status || "pending").toLowerCase().trim();

    if(status === "approved"){
        window.showPage("order", savedMobile);
        return;
    }

    if(status === "pending"){
        showPending();
        return;
    }

    if(status === "rejected"){
        showRejected();
        return;
    }

    showProcessing(status);
}

function goToDocument(){
    window.showPage("document", savedMobile);
}

function logoutUser(){

    stopApplicationRealtime();

    localStorage.removeItem(
        "partner_mobile"
    );

    sessionStorage.removeItem(
        "cezoo_just_submitted_application"
    );

    window.showPage("login");
}

function goToDashboard(){
    window.showPage("order", savedMobile);
}

window.startVerification = async function(mobile){
    savedMobile = mobile || localStorage.getItem("partner_mobile") || "";

    if(!savedMobile){
        window.showPage("login");
        return;
    }

    localStorage.setItem("partner_mobile", savedMobile);
    mobileText.innerText = savedMobile;

    // Consume the flag once. Refresh/re-login will no longer show
    // the generic Checking Application screen.
    const justSubmitted =
        sessionStorage.getItem("cezoo_just_submitted_application") === "1";

    if(justSubmitted){
        sessionStorage.removeItem("cezoo_just_submitted_application");
    }

    await checkApplicationStatus({
        showInitialChecking: justSubmitted
    });
};

window.checkApplicationStatus = () => checkApplicationStatus({showInitialChecking:false});
window.goToDashboard = goToDashboard;
window.goToDocument = goToDocument;
window.hideAllButtons = hideAllButtons;
window.logoutUser = logoutUser;
})();
function stopApplicationRealtime(){

    if(applicationRealtimeChannel){

        sb.removeChannel(
            applicationRealtimeChannel
        );

        applicationRealtimeChannel = null;
    }
}


function startApplicationRealtime(){

    stopApplicationRealtime();

    if(!savedMobile){
        return;
    }

    applicationRealtimeChannel =
        sb
            .channel(
                "delivery-application-" +
                savedMobile
            )
            .on(
                "postgres_changes",
                {
                    event:"UPDATE",
                    schema:"public",
                    table:"delivery_partner_applications",
                    filter:
                        "mobile=eq." +
                        savedMobile
                },
                payload => {

                    console.log(
                        "🔥 Application status changed:",
                        payload
                    );

                    const updated =
                        payload.new;

                    if(!updated){
                        return;
                    }

                    const status =
                        String(
                            updated.status ||
                            ""
                        )
                        .toLowerCase()
                        .trim();


                    // APPROVED → ORDER PAGE IMMEDIATELY
                   if(status === "approved"){

    stopApplicationRealtime();

    window.showPage(
        "order",
        savedMobile
    );

    return;
}

                    // REJECTED → UPDATE LIVE
                    if(status === "rejected"){

                        showRejected();

                        return;
                    }


                    // PENDING
                    if(status === "pending"){

                        showPending();

                        return;
                    }


                    showProcessing(status);
                }
            )
            .subscribe(status => {

                console.log(
                    "Realtime subscription:",
                    status
                );
            });
}