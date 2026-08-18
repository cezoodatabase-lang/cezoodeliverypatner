(function(){
const SUPABASE_URL = "https://ycqwdeiykbkfmmlpgdzd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";


const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

if(!document.getElementById("cezooSaveSpinnerStyle")){
    const style = document.createElement("style");
    style.id = "cezooSaveSpinnerStyle";
    style.textContent = `
        @keyframes cezooSaveSpin{
            to{ transform:rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

const steps = document.querySelectorAll(".step");
const stepNo = document.getElementById("stepNo");
const nextBtn = document.getElementById("nextBtn");

let current = 0;
let isSubmitting = false;

function showStep(index){

    steps.forEach(step=>{
        step.classList.remove("active");
    });

    steps[index].classList.add("active");

    stepNo.innerText = index + 1;

    document.querySelector(".prev").style.visibility =
    index === 0 ? "hidden" : "visible";

    if(index === steps.length - 1){
        nextBtn.innerText = "Submit";
        nextBtn.classList.add("submit");
    }else{
        nextBtn.innerText = "Next";
        nextBtn.classList.remove("submit");
    }
}

function shakeScreen(){

    document.querySelector(".container").classList.add("shake");

    if(navigator.vibrate){
        navigator.vibrate(200);
    }

    setTimeout(()=>{
        document.querySelector(".container").classList.remove("shake");
    },400);
}
function hasSelectedFile(inputId){
    const input = document.getElementById(inputId);
    return input && input.files && input.files.length > 0;
}
function validateStep(){

    if(current === 0){

        let name = document.getElementById("name").value.trim();
        let mobile = document.getElementById("mobile").value.trim();
        let gender = document.getElementById("gender").value;

        if(name === "" || !/^[0-9]{10}$/.test(mobile) || gender === "Select Gender"){
            shakeScreen();
            return false;
        }
    }

    if(current === 1){

    let vehicle = document.getElementById("vehicle").value.trim();

    if(
        vehicle === "" ||
        !hasSelectedFile("vehiclePhoto")
    ){
        shakeScreen();
        return false;
    }
}

    if(current === 2 && !hasSelectedFile("rcCard")){
    shakeScreen();
    return false;
}

if(current === 3 && !hasSelectedFile("license")){
    shakeScreen();
    return false;
}

if(current === 4 && !hasSelectedFile("insurance")){
    shakeScreen();
    return false;
}

if(current === 5 && !hasSelectedFile("aadhaar")){
    shakeScreen();
    return false;
}

if(current === 6 && !hasSelectedFile("pan")){
    shakeScreen();
    return false;
}

    return true;
}

function cleanFileName(name){
    return name
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "-")
        .replace(/-+/g, "-");
}

async function uploadOneFile(inputId, folderMobile){

    const input = document.getElementById(inputId);
    const file = input.files[0];

    if(!file){
        throw new Error(inputId + " file missing");
    }

    const safeName = cleanFileName(file.name);
    const filePath = `${folderMobile}/${Date.now()}-${inputId}-${safeName}`;

    const { error } = await sb
        .storage
        .from("delivery-documents")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false
        });

    if(error){
        throw new Error(inputId + " upload failed: " + error.message);
    }

    return filePath;
}

async function submitApplication(){

    if(isSubmitting) return;

    isSubmitting = true;
    nextBtn.disabled = true;
    nextBtn.innerText = "Uploading...";

    try{

        const fullName =
            document.querySelector("#documentPage #name").value.trim();

        const mobile =
            document.querySelector("#documentPage #mobile").value.trim();

        const gender =
            document.querySelector("#documentPage #gender").value;

        const vehicle =
            document.querySelector("#documentPage #vehicle")
                .value
                .trim()
                .toUpperCase();

        // Upload all required documents.
        const vehiclePhotoPath =
            await uploadOneFile("vehiclePhoto", mobile);

        const rcCardPath =
            await uploadOneFile("rcCard", mobile);

        const licensePath =
            await uploadOneFile("license", mobile);

        const insurancePath =
            await uploadOneFile("insurance", mobile);

        const aadhaarPath =
            await uploadOneFile("aadhaar", mobile);

        const panPath =
            await uploadOneFile("pan", mobile);

        nextBtn.innerHTML = `
            <span style="
                width:16px;
                height:16px;
                display:inline-block;
                border:2px solid rgba(255,255,255,.45);
                border-top-color:#fff;
                border-radius:50%;
                margin-right:7px;
                vertical-align:middle;
                animation:cezooSaveSpin .7s linear infinite;
            "></span>
            Saving
        `;

        const applicationRow = {
            full_name: fullName,
            mobile: mobile,
            gender: gender,
            vehicle_number: vehicle,

            vehicle_photo_path: vehiclePhotoPath,
            rc_card_path: rcCardPath,
            license_path: licensePath,
            insurance_path: insurancePath,
            aadhaar_path: aadhaarPath,
            pan_path: panPath,

            status: "pending"
        };

        /*
           Prevent Step 8 from staying on "Saving..." forever.
           If the insert response takes too long, we check whether
           Supabase already saved the row before showing an error.
        */
        const insertPromise = sb
            .from("delivery_partner_applications")
            .insert([applicationRow])
            .select("id,mobile,status,created_at")
            .single();

        const timeoutPromise =
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error("SAVE_TIMEOUT"));
                }, 15000);
            });

        let insertResult;

        try{
            insertResult = await Promise.race([
                insertPromise,
                timeoutPromise
            ]);
        }catch(error){

            if(error.message !== "SAVE_TIMEOUT"){
                throw error;
            }

            console.warn(
                "Application insert response timed out. Checking if it was already saved..."
            );

            const { data: existing, error: checkError } =
                await sb
                    .from("delivery_partner_applications")
                    .select("id,mobile,status,created_at")
                    .eq("mobile", mobile)
                    .order("created_at", { ascending:false })
                    .limit(1)
                    .maybeSingle();

            if(checkError){
                throw new Error(
                    "Application save check failed: " +
                    checkError.message
                );
            }

            if(!existing){
                throw new Error(
                    "Application could not be saved. Please try again."
                );
            }

            insertResult = {
                data: existing,
                error: null
            };
        }

        if(insertResult?.error){
            throw new Error(insertResult.error.message);
        }

        if(!insertResult?.data){
            throw new Error(
                "Supabase did not return the saved application."
            );
        }

        console.log(
            "✅ Application saved:",
            insertResult.data
        );

        localStorage.setItem(
            "partner_mobile",
            mobile
        );

        sessionStorage.setItem(
            "cezoo_just_submitted_application",
            "1"
        );

        showSuccessPage();

    }catch(error){

        console.error(
            "❌ Application submit failed:",
            error
        );

        alert(
            "Submit failed: " +
            (
                error?.message ||
                "Please try again."
            )
        );

        isSubmitting = false;
        nextBtn.disabled = false;
        nextBtn.innerText = "Submit";
    }
}

function nextStep(){

    if(!validateStep()){
        return;
    }

    if(current === steps.length - 1){
        submitApplication();
        return;
    }

    current++;
    showStep(current);
}

function prevStep(){

    if(isSubmitting) return;

    if(current > 0){
        current--;
        showStep(current);
    }
}

function showSuccessPage(){
    const savedMobile = localStorage.getItem("partner_mobile");
    window.showPage("verification", savedMobile);
}
showStep(0);

const mobileFromUrl = null;

const mobileFromStorage =
    String(
        localStorage.getItem(
            "partner_mobile"
        ) || ""
    )
    .replace(/\D/g,"")
    .trim();

const documentMobile =
    document.querySelector(
        "#documentPage #mobile"
    );

if(documentMobile){

    documentMobile.value =
        mobileFromStorage;

    documentMobile.readOnly =
        true;

    documentMobile.setAttribute(
        "aria-readonly",
        "true"
    );
}
function showSelectedFile(input){
    // Photo is captured/selected. No preview or file-name text is shown.
    return !!(input && input.files && input.files.length > 0);
}


window.cleanFileName = cleanFileName;
window.hasSelectedFile = hasSelectedFile;
window.nextStep = nextStep;
window.prevStep = prevStep;
window.shakeScreen = shakeScreen;
window.showSelectedFile = showSelectedFile;
window.showStep = showStep;
window.showSuccessPage = showSuccessPage;
window.submitApplication = submitApplication;
window.uploadOneFile = uploadOneFile;
window.validateStep = validateStep;
})();
