(function(){

/* =====================================================
   SUPABASE CONNECTIONS
===================================================== */

// DELIVERY PARTNER DATABASE
const PARTNER_SUPABASE_URL =
    "https://ycqwdeiykbkfmmlpgdzd.supabase.co";

const PARTNER_SUPABASE_KEY =
    "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const partnerSupabase =
    window.supabase.createClient(
        PARTNER_SUPABASE_URL,
        PARTNER_SUPABASE_KEY
    );


// ORDERS DATABASE
const ORDERS_SUPABASE_URL =
    "https://ycqwdeiykbkfmmlpgdzd.supabase.co";

const ORDERS_SUPABASE_KEY =
    "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const ordersSupabase =
    window.supabase.createClient(
        ORDERS_SUPABASE_URL,
        ORDERS_SUPABASE_KEY
    );

console.log("✅ CEZOO Supabase connected");

/* =====================================================
   DELIVERY PARTNER + UNLIMITED ORDER LOGIC
===================================================== */
let deliveryProofOrderIndex = null;
let deliveryProofImageData = "";
let deliveryProofSubmitting = false;
let deliveryEarningCloseTimer = null;
let currentDeliveryBoy = null;
let availableOrders = [];
let myOrders = [];
let activeOrders = [];
let visibleOrders = [];
let ordersRealtimeChannel = null;
let customerOrderStatusChannel = null;
let ordersReloadTimer = null;
let ignoreLocationRealtimeUntil = 0;
let cancelledAlertOrderId = null;
let cancelledAlertOrderType = null;
const LOCATION_SYNC_INTERVAL = 1000;
let lastLocationSavedAt = 0;
let locationStatusClock = null;

let codPaymentOrderIndex = null;
let codPaymentQrId = null;
let codPaymentQrImageUrl = "";
let codPaymentPollingTimer = null;
let codPaymentCheckRunning = false;
let codPaymentMode = "scanner";
let codCheckoutOrderId = null;
let codCheckoutOpening = false;
const COD_RAZORPAY_KEY = "rzp_live_SqrUSaPO5pA6gt";
const COD_PAYMENT_BACKEND_URL = "https://razropay.onrender.com";
const COD_PAYMENT_CHECK_INTERVAL = 2000;
const codPaidOrders = new Set(
    JSON.parse(localStorage.getItem("cezooCodPaidOrders") || "[]")
);

/* Cache product rows fetched from Supabase */
const deliveryProductCache = {};

const availableOrdersList =
    document.getElementById("availableOrdersList");

const refreshOrdersBtn =
    document.getElementById("refreshOrdersBtn");


function removeOrdersLoader(){

    if(!availableOrdersList){
        return;
    }

    availableOrdersList
        .querySelectorAll(
            ".ordersCenterLoader, .ordersShimmer, .shimmerCard, .shimmer"
        )
        .forEach(function(node){
            node.remove();
        });
}


function showOrdersLoader(){

    if(!availableOrdersList){
        return;
    }

    /*
      Show only ONE centered loader while a real foreground
      order fetch is running.
    */
    removeOrdersLoader();

    availableOrdersList.innerHTML =
        getOrdersShimmer();
}


function escapeHtml(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}


function formatMoney(value){
    const number = Number(value);

    return new Intl.NumberFormat("en-IN",{
        style:"currency",
        currency:"INR",
        maximumFractionDigits:2
    }).format(Number.isFinite(number) ? number : 0);
}


function hasCustomerLocation(order){
    const latitude = Number(order.latitude);
    const longitude = Number(order.longitude);

    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude !== 0 &&
        longitude !== 0
    );
}


function getMapUrl(order){
    if(!hasCustomerLocation(order)){
        return "#";
    }

    return (
        "https://www.google.com/maps?q=" +
        encodeURIComponent(order.latitude) +
        "," +
        encodeURIComponent(order.longitude)
    );
}


function getDistanceText(order){
    const distance = Number(order.delivery_distance);

    return Number.isFinite(distance) && distance >= 0
        ? distance.toFixed(2) + " km"
        : "Not available";
}


function getOrderItems(order){

    let items = order.items;

    if(typeof items === "string"){
        try{
            items = JSON.parse(items);
        }catch(error){
            items = [];
        }
    }

    return Array.isArray(items) ? items : [];
}


function getItemQuantity(item){

    const quantity =
        Number(
            item.qty ??
            item.quantity ??
            item.count ??
            1
        );

    return Number.isFinite(quantity) && quantity > 0
        ? quantity
        : 1;
}


function getItemUnitPrice(item){

    const price =
        Number(
            item.discount_price ??
            item.price ??
            item.unit_price ??
            item.selling_price ??
            item.final_price ??
            0
        );

    return Number.isFinite(price) ? price : 0;
}



function getItemImage(item){

    return (
        item.image1 ||
        item.image ||
        item.image_url ||
        item.product_image ||
        item.productImage ||
        item.thumbnail ||
        item.photo ||
        item.photo_url ||
        ""
    );
}


function getItemName(item){

    return (
        item.name ||
        item.product_name ||
        item.productName ||
        item.title ||
        item.item_name ||
        (
            item.product_id
                ? "Product " + item.product_id
                : "Product"
        )
    );
}


function getItemUnitText(item){

    return (
        item.unit ||
        item.quantity_text ||
        item.size ||
        ""
    );
}


function getCalculatedItemsTotal(order){

    const storedTotal =
        Number(
            order.item_total ??
            order.items_total ??
            order.subtotal
        );

    if(Number.isFinite(storedTotal)){
        return storedTotal;
    }

    return getOrderItems(order)
        .reduce(function(total,item){

            return total +
                (
                    getItemUnitPrice(item) *
                    getItemQuantity(item)
                );

        },0);
}



function getFinalOrderTotal(order){

    const storedTotal =
        Number(
            order.total_amount ??
            order.total_to_pay ??
            order.grand_total
        );

    const tip =
        Number(
            order.delivery_tip ??
            order.delivery_partner_tip ??
            order.tip ??
            0
        );

    const baseTotal =
        Number.isFinite(storedTotal)
            ? storedTotal
            : getCalculatedItemsTotal(order);

    /*
      Your total_amount normally already contains the tip,
      so return it directly when available.
    */
    if(Number.isFinite(storedTotal)){
        return storedTotal;
    }

    return baseTotal + tip;
}

/* =====================================================
   LOAD REAL PRODUCT DETAILS
   Order items may contain only product_id + product_table.
===================================================== */

async function loadDeliveryProductDetails(items){

    if(!Array.isArray(items) || items.length === 0){
        return [];
    }

    const groupedItems = {};
    const directItems = [];

    items.forEach(function(item){

        const tableName =
            String(
                item.product_table ||
                item.table_name ||
                item.table ||
                ""
            ).trim();

        const productId =
            Number(
                item.product_id ??
                item.id
            );

        /*
          Only skip the Supabase lookup when a REAL name or image
          is already saved inside the order item.

          Do not use getItemName() here because it creates fallback
          names such as "Product 3", which are not real product names.
        */
        const hasSavedProductName =
            Boolean(
                String(
                    item.name ||
                    item.product_name ||
                    item.productName ||
                    item.title ||
                    item.item_name ||
                    ""
                ).trim()
            );

        const hasSavedProductImage =
            Boolean(
                String(
                    item.image1 ||
                    item.image ||
                    item.image_url ||
                    item.product_image ||
                    item.productImage ||
                    item.thumbnail ||
                    item.photo ||
                    item.photo_url ||
                    ""
                ).trim()
            );

        if(hasSavedProductName || hasSavedProductImage){
            directItems.push({
                ...item,
                ordered_qty:getItemQuantity(item)
            });
            return;
        }

        if(!tableName || !Number.isFinite(productId)){
            directItems.push({
                ...item,
                ordered_qty:getItemQuantity(item)
            });
            return;
        }

        if(!groupedItems[tableName]){
            groupedItems[tableName] = [];
        }

        groupedItems[tableName].push({
            original_item:item,
            product_id:productId,
            qty:getItemQuantity(item)
        });
    });

    const loadedProducts = [];

    for(const [tableName, tableItems] of Object.entries(groupedItems)){

        const ids = [
            ...new Set(
                tableItems.map(function(item){
                    return item.product_id;
                })
            )
        ];

        const idsToFetch =
            ids.filter(function(id){
                return !deliveryProductCache[`${tableName}_${id}`];
            });

        if(idsToFetch.length > 0){

            const {data,error} =
                await ordersSupabase
                    .from(tableName)
                    .select(`
                        id,
                        name,
                        name_telugu,
                        quantity,
                        unit,
                        original_price,
                        discount_price,
                        image1
                    `)
                    .in("id",idsToFetch);

            if(error){
                console.error(
                    `Product fetch failed from ${tableName}:`,
                    error
                );
            }else{
                (data || []).forEach(function(product){
                    deliveryProductCache[
                        `${tableName}_${product.id}`
                    ] = {
                        ...product,
                        product_table:tableName
                    };
                });
            }
        }

        tableItems.forEach(function(savedItem){

            const product =
                deliveryProductCache[
                    `${tableName}_${savedItem.product_id}`
                ];

            if(product){
                loadedProducts.push({
                    ...savedItem.original_item,
                    ...product,
                    qty:savedItem.qty,
                    ordered_qty:savedItem.qty
                });
            }else{
                loadedProducts.push({
                    ...savedItem.original_item,
                    product_id:savedItem.product_id,
                    product_table:tableName,
                    qty:savedItem.qty,
                    ordered_qty:savedItem.qty
                });
            }
        });
    }

    /*
      Preserve the original order of items.
    */
    return items.map(function(originalItem){

        const originalTable =
            String(
                originalItem.product_table ||
                originalItem.table_name ||
                originalItem.table ||
                ""
            ).trim();

        const originalId =
            Number(
                originalItem.product_id ??
                originalItem.id
            );

        const loadedMatch =
            loadedProducts.find(function(product){
                return (
                    String(product.product_table || "") === originalTable &&
                    Number(product.id ?? product.product_id) === originalId
                );
            });

        if(loadedMatch){
            return loadedMatch;
        }

        const directIndex =
            directItems.findIndex(function(item){
                return item === originalItem ||
                    (
                        Number(item.product_id ?? item.id) === originalId &&
                        String(
                            item.product_table ||
                            item.table_name ||
                            item.table ||
                            ""
                        ).trim() === originalTable
                    );
            });

        if(directIndex >= 0){
            return directItems[directIndex];
        }

        return originalItem;
    });
}


async function prepareOrderProducts(order){

    const savedItems = getOrderItems(order);

    try{
        const completeItems =
            await loadDeliveryProductDetails(savedItems);

        return {
            ...order,
            items:completeItems
        };
    }catch(error){
        console.error("Prepare order products error:",error);
        return order;
    }
}


function renderOrderProducts(order){

    const items =
        getOrderItems(order);

    if(items.length === 0){
        return `
            <div class="productsPanel">
                <div class="productsTitle">
                    <i class="fa-solid fa-basket-shopping"></i>
                    Products
                </div>

                <div class="productRows">
                    <div class="productRow">
                        <div class="productName">
                            <strong>Product details unavailable</strong>
                            <span>No item data found in this order.</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="productsPanel">

            <div class="productsTitle">
                <i class="fa-solid fa-basket-shopping"></i>
                Products (${items.length})
            </div>

            <div class="productRows">

                ${items.map(function(item){

                    const quantity =
                        getItemQuantity(item);

                    const unitPrice =
                        getItemUnitPrice(item);

                    const lineTotal =
                        quantity * unitPrice;

                    const packText =
    [
        item.quantity,
        item.unit
    ]
    .filter(Boolean)
    .join(" ");

const unitText =
    packText ||
    getItemUnitText(item);
                    return `
                        <div class="productRow">

                            <div class="productMain">

                                <div class="productImage">

                                    ${
                                        getItemImage(item)
                                            ? `
                                                <img
                                                    src="${escapeHtml(getItemImage(item))}"
                                                    alt="${escapeHtml(getItemName(item))}"
                                                    onerror="
                                                        this.style.display='none';
                                                        this.nextElementSibling.style.display='flex';
                                                    "
                                                >

                                                <span
                                                    class="productImageFallback"
                                                    style="display:none"
                                                >
                                                    <i class="fa-solid fa-basket-shopping"></i>
                                                </span>
                                            `
                                            : `
                                                <span class="productImageFallback">
                                                    <i class="fa-solid fa-basket-shopping"></i>
                                                </span>
                                            `
                                    }

                                </div>

                                <div class="productName">

                                  <strong>
    ${escapeHtml(getItemName(item))}
</strong>

${unitText
    ? `
        <span>
            ${escapeHtml(unitText)}
        </span>
    `
    : ""
}

<span>
    Quantity: ${quantity}
</span>

                                </div>

                            </div>

                            <div class="productPrice">
                                ${formatMoney(lineTotal)}
                            </div>

                        </div>
                    `;

                }).join("")}

          </div>

</div>
    `;
}
function getTotalOrderedItems(order){

    return getOrderItems(order)
        .reduce(function(total,item){
            return total + getItemQuantity(item);
        },0);
}


function getDeliveryBoyEarning(order){

    const distance =
        Number(order.delivery_distance || 0);

    const totalItems =
        getTotalOrderedItems(order);

    const deliveryTip =
        Number(
            order.delivery_tip ??
            order.delivery_partner_tip ??
            order.tip ??
            0
        );

    let distanceEarning = 0;

    /*
      Distance earning rules
    */

    if(distance > 0 && distance < 1){
        // 100 metres to 999 metres
        distanceEarning = 12;

    }else if(distance >= 1 && distance <= 3){
        distanceEarning = 20;

    }else if(distance > 3 && distance <= 6){
        distanceEarning = 30;

    }else if(distance > 6 && distance <= 8){
        distanceEarning = 35;

    }else if(distance > 8 && distance <= 12){
        distanceEarning = 42;

    }else if(distance > 12){
        /*
          ₹42 up to 12 km,
          then ₹5 extra for every started additional kilometre.
        */
        distanceEarning =
            42 +
            (
                Math.ceil(distance - 12) * 5
            );
    }

    /*
      Item quantity bonus:
      1–5 items   = ₹0
      6–9 items   = ₹3
      10+ items   = ₹5
    */

    let itemBonus = 0;

    if(totalItems >= 10){
        itemBonus = 5;
    }else if(totalItems > 5){
        itemBonus = 3;
    }

    return {
        distanceEarning,
        itemBonus,
        deliveryTip,
        totalItems,
        total:
            distanceEarning +
            itemBonus +
            deliveryTip
    };
}

function renderOrderBill(order){

    const itemTotal =
        getCalculatedItemsTotal(order);

    const deliveryFee =
        Number(order.delivery_fee || 0);

    const handlingFee =
        Number(order.handling_fee || 0);

    const tip =
    Number(
        order.delivery_tip ??
        order.delivery_partner_tip ??
        order.tip ??
        0
    );
const earning =
    getDeliveryBoyEarning(order);
  const storedFinalTotal =
    Number(
        order.total_amount ??
        order.total_to_pay ??
        order.grand_total
    );

const calculatedFinalTotal =
    itemTotal +
    deliveryFee +
    handlingFee +
    tip;

const finalTotal =
    Number.isFinite(storedFinalTotal)
        ? storedFinalTotal
        : calculatedFinalTotal;

    return `
        <div class="billPanel">

            <div class="billRow">
                <span>Item Total</span>
                <strong>${formatMoney(itemTotal)}</strong>
            </div>

            <div class="billRow">
                <span>Delivery Fee</span>
                <strong>${formatMoney(deliveryFee)}</strong>
            </div>

            <div class="billRow">
                <span>Handling Fee</span>
                <strong>${formatMoney(handlingFee)}</strong>
            </div>

            ${tip > 0
                ? `
                    <div class="billRow">
                        <span>Delivery Partner Tip</span>
                        <strong>${formatMoney(tip)}</strong>
                    </div>
                `
                : ""
            }

           <div class="billRow total">
    <span>Total to Collect</span>
    <strong>${formatMoney(finalTotal)}</strong>
</div>

<div class="billRow">
    <span>Distance Earnings</span>
    <strong>
        ${formatMoney(earning.distanceEarning)}
    </strong>
</div>

${
    earning.itemBonus > 0
        ? `
            <div class="billRow">
                <span>
                    Item Bonus (${earning.totalItems} items)
                </span>

                <strong>
                    +${formatMoney(earning.itemBonus)}
                </strong>
            </div>
        `
        : ""
}

${
    earning.deliveryTip > 0
        ? `
            <div class="billRow">
                <span>Tip Earnings</span>

                <strong>
                    +${formatMoney(earning.deliveryTip)}
                </strong>
            </div>
        `
        : ""
}

<div class="billRow earningTotal">
    <span>Your Earnings</span>
    <strong>${formatMoney(earning.total)}</strong>
</div>

        </div>
    `;
}



function createDeliveryUuid(){
    if(window.crypto?.randomUUID){
        return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
        .replace(/[xy]/g,function(character){
            const random = Math.random() * 16 | 0;
            const value =
                character === "x"
                    ? random
                    : (random & 0x3 | 0x8);

            return value.toString(16);
        });
}


async function initializeDeliveryBoy(){

    const mobile =
        localStorage.getItem("partner_mobile");

    if(!mobile){
        console.error("partner_mobile is missing");
        return false;
    }

    const {data,error} =
        await partnerSupabase
            .from("delivery_partner_applications")
            .select("*")
            .eq("mobile",mobile)
            .order("created_at",{ascending:false})
            .limit(1)
            .maybeSingle();

    if(error){
        console.error("Partner verification error:",error);
        return false;
    }

    if(!data){
        console.error("Delivery partner not found");
        return false;
    }

    const status =
        String(data.status || "")
            .toLowerCase()
            .trim();

    if(status !== "approved"){
        console.error("Delivery partner is not approved");
        return false;
    }

    let savedDeliveryBoy = null;

    try{
        savedDeliveryBoy =
            JSON.parse(
                localStorage.getItem("deliveryBoy") || "null"
            );
    }catch(error){
        savedDeliveryBoy = null;
    }

    const deliveryBoyId =
        savedDeliveryBoy?.id ||
        localStorage.getItem("delivery_boy_uuid") ||
        data.delivery_boy_uuid ||
        data.id ||
        createDeliveryUuid();

    currentDeliveryBoy = {
        id:deliveryBoyId,
        name:data.full_name || "Delivery Partner",
        mobile:data.mobile || mobile
    };

    localStorage.setItem(
        "delivery_boy_uuid",
        currentDeliveryBoy.id
    );

    localStorage.setItem(
        "deliveryBoy",
        JSON.stringify(currentDeliveryBoy)
    );

    /*
      Keep the verified real name in its own stable cache.
      Opening profile/ID/attendance sheets must never replace it
      with the generic "Delivery Partner" placeholder.
    */
    if(
        currentDeliveryBoy.name &&
        currentDeliveryBoy.name !== "Delivery Partner"
    ){
        localStorage.setItem(
            "partner_full_name",
            currentDeliveryBoy.name
        );
    }

    document.getElementById("profileName").textContent =
        currentDeliveryBoy.name;

    document.getElementById("profileMobile").textContent =
        "+91 " + currentDeliveryBoy.mobile;

    return true;
}


function sortOrders(a,b){
    return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );
}


async function loadOrders(options = {}){

    const silentLoad = options === true || options?.silent === true;
    const savedScrollY = window.scrollY;


    if(!currentDeliveryBoy){
        const verified =
            await initializeDeliveryBoy();

        if(!verified){
            removeOrdersLoader();

            availableOrdersList.innerHTML = `
                <div class="ordersState">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>Account not verified</h3>
                    <p>Please log in with an approved delivery account.</p>
                </div>
            `;
            return;
        }
    }

    if(!silentLoad){
        refreshOrdersBtn?.classList.add("loading");
        showOrdersLoader();
    }

    try{

        const [
            cashAvailableResponse,
            upiAvailableResponse,
            myCashResponse,
            myUpiResponse
        ] = await Promise.all([

            ordersSupabase
                .from("delivery_cash_orders")
                .select("*")
                .eq("delivery_boy_accepted",false)
                .eq("delivery_status","assigned")
                .order("created_at",{ascending:false}),

            ordersSupabase
                .from("delivery_upi_orders")
                .select("*")
                .eq("delivery_boy_accepted",false)
                .eq("delivery_status","assigned")
                .order("created_at",{ascending:false}),

            ordersSupabase
                .from("delivery_cash_orders")
                .select("*")
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                )
                .order("created_at",{ascending:false}),

            ordersSupabase
                .from("delivery_upi_orders")
                .select("*")
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                )
                .order("created_at",{ascending:false})
        ]);

        const responses = [
            cashAvailableResponse,
            upiAvailableResponse,
            myCashResponse,
            myUpiResponse
        ];

        const failed =
            responses.find(item => item.error);

        if(failed){
            throw failed.error;
        }

        availableOrders = [
            ...(cashAvailableResponse.data || []).map(order => ({
                ...order,
                _order_type:"cash"
            })),
            ...(upiAvailableResponse.data || []).map(order => ({
                ...order,
                _order_type:"upi"
            }))
        ].sort(sortOrders);

        myOrders = [
            ...(myCashResponse.data || []).map(order => ({
                ...order,
                _order_type:"cash"
            })),
            ...(myUpiResponse.data || []).map(order => ({
                ...order,
                _order_type:"upi"
            }))
        ].sort(sortOrders);

        activeOrders =
            myOrders.filter(function(order){
                const status =
                    String(order.delivery_status || "")
                        .toLowerCase()
                        .trim();

                return ![
                    "delivered",
                    "cancelled"
                ].includes(status);
            });

        await renderOneOrder();

/*
  Restore live tracking after page refresh when
  an accepted, active order exists.
*/
const acceptedActiveOrder =
    activeOrders.find(function(order){

        const status =
            String(order.delivery_status || "")
                .toLowerCase()
                .trim();

        return (
            order.delivery_boy_accepted === true &&
            ![
                "delivered",
                "cancelled"
            ].includes(status)
        );
    });

if(acceptedActiveOrder){

    const isSameTrackedOrder =
        trackedDeliveryOrder &&
        String(trackedDeliveryOrder.order_id) ===
            String(acceptedActiveOrder.order_id);

    if(!isSameTrackedOrder){
        startDeliveryLocationTracking(
            acceptedActiveOrder
        );
    }else{
        trackedDeliveryOrder =
            acceptedActiveOrder;
    }

}else{
    stopDeliveryLocationTracking();
}

    }catch(error){

        console.error("Load orders error:",error);

        removeOrdersLoader();

        availableOrdersList.innerHTML = `
            <div class="ordersState">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>Could not load orders</h3>
                <p>${escapeHtml(error.message || "Please try again.")}</p>
            </div>
        `;

    }finally{

        /*
          No spinner is allowed to survive after loadOrders() finishes.
        */
        removeOrdersLoader();

        refreshOrdersBtn?.classList.remove("loading");

        if(silentLoad){
            requestAnimationFrame(function(){
                window.scrollTo({top:savedScrollY,left:0,behavior:"instant"});
            });
        }
    }
}


function getOrderAction(order,index){

    const status =
        String(order.delivery_status || "assigned")
            .toLowerCase()
            .trim();

    const isMyOrder =
        order.delivery_boy_accepted === true &&
        String(order.delivery_boy_mobile || "") ===
            String(currentDeliveryBoy?.mobile || "");

    if(!isMyOrder){
        return `
            <button
                class="orderActionBtn"
                type="button"
                onclick="acceptOrder(${index},this)"
            >
                Accept Order
            </button>
        `;
    }

    if(status === "assigned" || status === "accepted"){
        return `
            <button
                class="orderActionBtn pickup"
                type="button"
                onclick="updateDeliveryStatus(${index},'picked_up',this)"
            >
                <i class="fa-solid fa-box"></i>
                Picked Up
            </button>
        `;
    }

    if(status === "picked_up"){
        return `
            <button
                class="orderActionBtn way"
                type="button"
                onclick="updateDeliveryStatus(${index},'on_the_way',this)"
            >
                <i class="fa-solid fa-motorcycle"></i>
                On The Way
            </button>
        `;
    }

    return `
    <button
        class="orderActionBtn delivered"
        type="button"
        onclick="handleDeliveredClick(${index})"
    >
        <i class="fa-solid fa-circle-check"></i>
        Delivered
    </button>
`;
}


async function renderOneOrder(){

    /*
      A completed fetch must never leave the center spinner behind.
    */
    removeOrdersLoader();

    /*
      ONE-ORDER QUEUE

      Rule:
      1. If this delivery partner already has an accepted active order,
         show ONLY that order until it is delivered/cancelled.
      2. Otherwise show ONLY the first available assigned order.
      3. Never render multiple delivery cards at the same time.
    */

    const currentActiveOrder =
        activeOrders.find(function(order){

            const status =
                String(order.delivery_status || "")
                    .toLowerCase()
                    .trim();

            return (
                order.delivery_boy_accepted === true &&
                !["delivered","cancelled"].includes(status)
            );
        });

    let nextOrder = null;

    if(currentActiveOrder){

        nextOrder = currentActiveOrder;

    }else{

        nextOrder =
            availableOrders.find(function(order){

                const status =
                    String(order.delivery_status || "assigned")
                        .toLowerCase()
                        .trim();

                return (
                    order.delivery_boy_accepted !== true &&
                    status === "assigned"
                );
            }) || null;
    }

    visibleOrders =
        nextOrder
            ? [nextOrder]
            : [];

    document.getElementById("ordersCountText").textContent =
        visibleOrders.length === 1
            ? (
                currentActiveOrder
                    ? "1 active order"
                    : "1 order available"
            )
            : "0 orders available";

document.getElementById("ordersHeaderTitle").style.display = "none";
    if(visibleOrders.length === 0){

        document.getElementById("ordersCountText").textContent =
            "0 orders available";

       availableOrdersList.innerHTML = `
    <div class="searchingOrders">

        <i class="fa fa-search searchingIcon"></i>

        <h3>Searching for Orders...</h3>

        <p>Stay online to receive new delivery requests.</p>

    </div>
`;

        return;
    }
document.getElementById("ordersHeaderTitle").style.display = "";
    /*
      Fetch the actual product rows before rendering.
      This supplies name, image1, quantity, unit and price.
    */
    visibleOrders =
        await Promise.all(
            visibleOrders.map(prepareOrderProducts)
        );

    const nextOrdersHtml =
        visibleOrders.map(function(order,index){

            const mapAvailable =
                hasCustomerLocation(order);

            const paymentType =
                order._order_type === "upi"
                    ? "UPI"
                    : "Cash on Delivery";

            const paymentClass =
                order._order_type === "upi"
                    ? "upi"
                    : "cash";

            const customerName =
                order.user_name ||
                order.customer_name ||
                order.name ||
                "Customer";

            return `
                <article class="orderCard" data-order-key="${escapeHtml(String(order._order_type || '') + '::' + String(order.order_id ?? order.id ?? ''))}">

                    ${renderOrderProducts(order)}

                    <div class="orderTopBar">

                        <div class="orderIdentity">
                            <span>Order ID</span>
                            <strong>
                                ${escapeHtml(order.order_id || "—")}
                            </strong>
                        </div>

                        <span class="paymentBadge ${paymentClass}">
                            ${paymentType}
                        </span>

                    </div>

                    <div class="customerStrip">
                        <span>Customer</span>
                        <strong>${escapeHtml(customerName)}</strong>
                    </div>
${
    order.delivery_boy_accepted === true
        ? (() => {

            const customerMobile =
                String(
                    order.customer_mobile ||
                    order.user_mobile ||
                    order.mobile ||
                    ""
                )
                .replace(/[^\d+]/g,"")
                .trim();

            return customerMobile
                ? `
                    <div class="customerStrip customerMobileStrip">

                        <div>
                            <span>Customer Mobile</span>

                            <strong>
                                ${escapeHtml(customerMobile)}
                            </strong>
                        </div>

                        <a
                            class="customerCallBtn"
                            href="tel:${escapeHtml(customerMobile)}"
                            aria-label="Call customer"
                        >
                            <i class="fa-solid fa-phone"></i>
                            Call
                        </a>

                    </div>
                `
                : "";
        })()
        : ""
}
                    <div class="orderGrid">

                        <div class="orderBox amount">
                            <i class="fa-solid fa-indian-rupee-sign"></i>
                            <span class="orderLabel">Total Amount</span>
                            <strong class="orderValue">
                                ${formatMoney(getFinalOrderTotal(order))}
                            </strong>
                        </div>

                        <div class="orderBox">
                            <i class="fa-solid fa-route"></i>
                            <span class="orderLabel">Distance(From Store)</span>
                            <strong class="orderValue">
                                ${escapeHtml(getDistanceText(order))}
                            </strong>
                        </div>

                    </div>

                   <div class="customerStrip">
    <span>Delivery Type</span>
    <strong>
        ${
            String(order.delivery_mode || "").toLowerCase() === "12_hours"
                ? "Day Delivery"
                : "Instant Delivery"
        }
    </strong>
</div>

${
    Number(order.delivery_tip || order.delivery_partner_tip || 0) > 0
        ? `
            <div class="customerStrip">
                <span>Delivery Partner Tip</span>
                <strong>
                    ${formatMoney(
                        order.delivery_tip ||
                        order.delivery_partner_tip
                    )}
                </strong>
            </div>
        `
        : ""
}

${
    Array.isArray(order.delivery_instructions)
        ? order.delivery_instructions.length
            ? `
                <div class="customerStrip">
                    <span>Delivery Instructions</span>
                    <strong>
                        ${order.delivery_instructions
                            .map(escapeHtml)
                            .join(", ")}
                    </strong>
                </div>
            `
            : ""
        : (
            String(order.delivery_instructions || "").trim()
                ? `
                    <div class="customerStrip">
                        <span>Delivery Instructions</span>
                        <strong>
                            ${escapeHtml(order.delivery_instructions)}
                        </strong>
                    </div>
                `
                : ""
        )
}

${renderOrderBill(order)}

${
    order.delivery_boy_accepted === true
        ? (
            mapAvailable
                ? `
                    <a
                        class="orderMapBtn"
                        href="${getMapUrl(order)}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <i class="fa-solid fa-map-location-dot"></i>
                        View on Map
                    </a>
                `
                : `
                    <div class="orderMapBtn disabled">
                        <i class="fa-solid fa-location-slash"></i>
                        Location Not Available
                    </div>
                `
        )
        : ""
}

${getOrderAction(order,index)}

                  

                </article>
            `;
        }).join("");

    syncOrdersDom(nextOrdersHtml);
    updateActiveOrdersLimit();
}
window.acceptOrder =
async function(index,button){

    const order =
        visibleOrders[index];

    if(!order || !currentDeliveryBoy){
        return;
    }

    button.disabled = true;

    const oldHtml =
        button.innerHTML;

    button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Accepting
    `;

    try{

        /*
          1. Accept the order in the delivery table.

          Cash:
          delivery_cash_orders

          UPI:
          delivery_upi_orders
        */
        /*
           Accept the order DIRECTLY in the correct delivery table.

           This replaces the old RPC:
               accept_delivery_order

           The RPC was returning 404 because that function does not
           exist in the current Supabase project.

           The filters below are important:
           - same order_id
           - still not accepted
           - still assigned

           Only an available order can be claimed.
        */

        const deliveryTable =
            order._order_type === "upi"
                ? "delivery_upi_orders"
                : "delivery_cash_orders";

        const {
            data:acceptedDeliveryOrder,
            error:acceptError
        } =
            await ordersSupabase
                .from(deliveryTable)
                .update({
                    delivery_boy_accepted:true,

                    delivery_boy_id:
                        String(currentDeliveryBoy.id),

                    delivery_boy_name:
                        String(currentDeliveryBoy.name),

                    delivery_boy_mobile:
                        String(currentDeliveryBoy.mobile),

                    delivery_status:"accepted"
                })
                .eq(
                    "order_id",
                    String(order.order_id)
                )
                .eq(
                    "delivery_boy_accepted",
                    false
                )
                .eq(
                    "delivery_status",
                    "assigned"
                )
                .select("*")
                .maybeSingle();


        if(acceptError){
            throw acceptError;
        }


        /*
           If no row came back, somebody else already accepted
           the order or the order is no longer available.
        */
        if(!acceptedDeliveryOrder){

            console.warn(
                "⚠️ Order is no longer available:",
                {
                    order_id:order.order_id,
                    table:deliveryTable
                }
            );

            button.disabled = true;
            button.innerHTML = `
                <i class="fa-solid fa-circle-xmark"></i>
                Already Taken
            `;

            await loadOrders({silent:true});

            return;
        }


        console.log(
            "✅ Delivery order accepted:",
            acceptedDeliveryOrder
        );


        /*
          2. Save the same delivery partner details
          in the customer's original order table.

          Cash:
          cash_delivery_orders

          UPI:
          upi_orders
        */
        const originalOrderTable =
            order._order_type === "upi"
                ? "upi_orders"
                : "cash_delivery_orders";

        const {
            data:updatedCustomerOrder,
            error:customerOrderError
        } =
            await ordersSupabase
    .from(originalOrderTable)
    .update({
        delivery_boy_accepted:
            true,

        delivery_boy_id:
            String(currentDeliveryBoy.id),

        delivery_boy_name:
            String(currentDeliveryBoy.name),

        delivery_boy_mobile:
            String(currentDeliveryBoy.mobile),

        /*
          Important:
          Changing order_status triggers the customer notification.
        */
        order_status:
            "delivery_boy_assigned"
    })
                .eq(
                    "order_id",
                    String(order.order_id)
                )
                .select(`
                    order_id,
                    delivery_boy_accepted,
                    delivery_boy_id,
                    delivery_boy_name,
                    delivery_boy_mobile
                `)
                .maybeSingle();

        if(customerOrderError){
            throw customerOrderError;
        }

        if(!updatedCustomerOrder){

            throw new Error(
                "Original customer order was not found for " +
                order.order_id
            );
        }

        console.log(
            "✅ Delivery partner saved in customer order:",
            {
                table:
                    originalOrderTable,

                row:
                    updatedCustomerOrder
            }
        );


        /*
          3. Reload accepted delivery order.
        */
        await loadOrders({silent:true});


        const acceptedOrder =
            activeOrders.find(function(item){

                return (
                    String(item.order_id) ===
                    String(order.order_id)
                );

            });


        if(acceptedOrder){

            await saveAcceptedOrderDutyStats(
                acceptedOrder
            );

            startDeliveryLocationTracking(
                acceptedOrder
            );
        }

    }catch(error){

        console.error(
            "Accept order error:",
            error
        );

        button.disabled = false;
        button.innerHTML = oldHtml;
    }
};










function saveCodPaidOrder(order){
    const key = `${order._order_type}:${order.order_id}`;
    codPaidOrders.add(key);
    localStorage.setItem(
        "cezooCodPaidOrders",
        JSON.stringify([...codPaidOrders])
    );
}

function isCodOrderPaid(order){
    return codPaidOrders.has(
        `${order._order_type}:${order.order_id}`
    );
}

window.handleDeliveredClick = function(index){
    const order = visibleOrders[index];

    if(!order){
        return;
    }

    console.log("🚚 Delivered clicked:",{
        orderId:order.order_id,
        orderType:order._order_type,
        total:getFinalOrderTotal(order)
    });

    if(
        order._order_type === "upi" ||
        isCodOrderPaid(order)
    ){
        openDeliveryProofSheet(index);
        return;
    }

    openCodPaymentFlow(index);
};

function setCodPaymentStep(stepId){
    [
        "codMethodStep",
        "codQrStep",
        "codSuccessStep"
    ].forEach(function(id){
        document
            .getElementById(id)
            ?.classList.toggle(
                "active",
                id === stepId
            );
    });
}

function stopCodPaymentPolling(){
    if(codPaymentPollingTimer){
        clearInterval(codPaymentPollingTimer);
        codPaymentPollingTimer = null;
    }

    codPaymentCheckRunning = false;
    console.log("🛑 COD payment polling stopped");
}

function resetCodQrUi(){
    document.getElementById("codQrLoading").style.display = "flex";
    document.getElementById("codQrReady").style.display = "none";
    document.getElementById("codPaymentError").classList.remove("show");
    document.getElementById("codPaymentError").textContent = "";
    document.getElementById("codQrImage").removeAttribute("src");
    document.getElementById("codStatusIcon").innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i>';
    document.getElementById("codStatusTitle").textContent =
        "Waiting for payment";
    document.getElementById("codStatusDescription").textContent =
        "Status updates automatically.";
}

window.openCodPaymentFlow = function(index){
    const order = visibleOrders[index];

    if(!order){
        return;
    }

    codPaymentOrderIndex = index;
    codPaymentQrId = null;
    codPaymentQrImageUrl = "";
    codCheckoutOrderId = null;
    codCheckoutOpening = false;
    codPaymentMode = "scanner";

    stopCodPaymentPolling();
    resetCodQrUi();
    setCodPaymentStep("codMethodStep");

    document.getElementById("codPaymentAmount").textContent =
        formatMoney(getFinalOrderTotal(order));

    document
        .getElementById("codPaymentOverlay")
        .classList.add("open");

    document.body.style.overflow = "hidden";

    console.log("💵 COD payment options opened:",{
        orderId:order.order_id,
        amount:getFinalOrderTotal(order)
    });
};

window.closeCodPaymentFlow = function(){
    stopCodPaymentPolling();

    document
        .getElementById("codPaymentOverlay")
        .classList.remove("open");

    document.body.style.overflow = "";

    codPaymentOrderIndex = null;
    codPaymentQrId = null;
    codPaymentQrImageUrl = "";
    codCheckoutOrderId = null;
    codCheckoutOpening = false;
};

document
    .getElementById("codPaymentOverlay")
    .addEventListener("click",closeCodPaymentFlow);

window.changeCodPaymentMethod = function(){
    stopCodPaymentPolling();
    codPaymentQrId = null;
    codPaymentQrImageUrl = "";
    resetCodQrUi();
    setCodPaymentStep("codMethodStep");
    console.log("🔄 COD payment method changed");
};

function showCodPaymentError(message){
    const box =
        document.getElementById("codPaymentError");

    box.textContent =
        message || "Payment could not be started.";

    box.classList.add("show");

    console.error("❌ COD payment:",message);
}

async function readCodJsonResponse(response){
    const text = await response.text();

    if(!text){
        return {};
    }

    try{
        return JSON.parse(text);
    }catch(error){
        throw new Error(
            "Payment server returned an invalid response."
        );
    }
}

window.startCodQrPayment = async function(mode){
    const order = visibleOrders[codPaymentOrderIndex];

    if(!order){
        return;
    }

    codPaymentMode =
        mode === "phone"
            ? "phone"
            : "scanner";

    stopCodPaymentPolling();
    resetCodQrUi();

    /*
      OPTION 2:
      Delivery partner pays on this same phone
      using normal Razorpay Checkout.
    */
    if(codPaymentMode === "phone"){
        await openCodRazorpayCheckout();
        return;
    }

    /*
      OPTION 1:
      Customer scans Razorpay QR.
    */
    setCodPaymentStep("codQrStep");

    const amountInPaise =
        Math.round(getFinalOrderTotal(order) * 100);

    try{
        if(!amountInPaise || amountInPaise <= 0){
            throw new Error("Invalid order payment amount.");
        }

        const response = await fetch(
            `${COD_PAYMENT_BACKEND_URL}/create-qr`,
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    amount:amountInPaise
                })
            }
        );

        const data = await response.json();

        console.log("CUSTOMER QR RESPONSE:",data);

        if(
            !data ||
            !data.success ||
            !data.qr_id ||
            !data.image_url
        ){
            throw new Error(
                data?.message ||
                "Unable to generate payment QR."
            );
        }

        codPaymentQrId = data.qr_id;
        codPaymentQrImageUrl = data.image_url;

        document.getElementById("codQrImage").src =
            codPaymentQrImageUrl;

        document.getElementById("codQrLoading").style.display =
            "none";

        document.getElementById("codQrReady").style.display =
            "block";

        document.getElementById("codQrTitle").textContent =
            "Ask customer to scan";

        document.getElementById("codQrDescription").textContent =
            "Customer can scan using Paytm, PhonePe, Google Pay or any UPI app.";

        document.getElementById(
            "codShareQrBtn"
        ).style.display = "none";

        startCodPaymentPolling(codPaymentQrId);

    }catch(error){
        document.getElementById("codQrLoading").style.display =
            "none";

        showCodPaymentError(
            error.message ||
            "Unable to start QR payment."
        );

        console.error("Customer QR error:",error);
    }
};


window.openCodRazorpayCheckout = async function(){
    const order = visibleOrders[codPaymentOrderIndex];

    if(!order || codCheckoutOpening){
        return;
    }

    const finalAmount =
        Number(getFinalOrderTotal(order));

    if(!finalAmount || finalAmount <= 0){
        showCodPaymentError("Invalid order payment amount.");
        return;
    }

    if(typeof window.Razorpay !== "function"){
        showCodPaymentError(
            "Razorpay Checkout is not loaded."
        );
        return;
    }

    codCheckoutOpening = true;
    hideCodPaymentError();

    const paymentOverlay =
        document.getElementById("codPaymentOverlay");

    try{
        console.log(
            "CREATING RAZORPAY ORDER:",
            {
                amount:finalAmount,
                orderId:order.order_id
            }
        );

        const response = await fetch(
            "https://razropay.onrender.com/create-order",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify({
                    amount:Math.round(finalAmount * 100)
                })
            }
        );

        const data = await response.json();

        console.log("RAZORPAY RESPONSE:",data);

        if(!data || !data.success || !data.order){
            codCheckoutOpening = false;
            showCodPaymentError(
                data?.message ||
                "Razorpay order failed."
            );
            return;
        }

        codCheckoutOrderId = data.order.id;

        const partnerName =
            currentDeliveryBoy?.name ||
            currentDeliveryBoy?.delivery_boy_name ||
            "Delivery Partner";

        const partnerMobile =
            currentDeliveryBoy?.mobile ||
            currentDeliveryBoy?.delivery_boy_mobile ||
            "";

        const options = {
            key:"rzp_live_SqrUSaPO5pA6gt",

            amount:data.order.amount,
            currency:data.order.currency,
            order_id:data.order.id,

            name:"CEZOO",
            description:"Cash Order Payment",

            prefill:{
                name:partnerName,
                contact:partnerMobile
            },

            theme:{
                color:"#0BD957"
            },

            handler:function(paymentResponse){
                console.log(
                    "Payment Success:",
                    paymentResponse
                );

                codCheckoutOpening = false;

                if(paymentOverlay){
                    paymentOverlay.style.display = "";
                }

                completeCodPayment({
                    paid:true,
                    status:"captured",

                    payment_id:
                        paymentResponse.razorpay_payment_id,

                    razorpay_order_id:
                        paymentResponse.razorpay_order_id,

                    razorpay_signature:
                        paymentResponse.razorpay_signature,

                    amount:data.order.amount,
                    method:"razorpay_checkout",
                    paid_by:"delivery_partner"
                });
            },

            modal:{
                ondismiss:function(){
                    codCheckoutOpening = false;

                    console.log("Razorpay closed");

                    if(paymentOverlay){
                        paymentOverlay.style.display = "";
                        paymentOverlay.classList.add("open");
                    }

                    setCodPaymentStep("codQrStep");

                    document.getElementById(
                        "codQrLoading"
                    ).style.display = "none";

                    document.getElementById(
                        "codQrReady"
                    ).style.display = "block";

                    document.getElementById(
                        "codQrTitle"
                    ).textContent =
                        "Payment not completed";

                    document.getElementById(
                        "codQrDescription"
                    ).textContent =
                        "Tap below to reopen Razorpay and complete payment on this phone.";

                    document.getElementById(
                        "codShareQrBtn"
                    ).style.display = "block";
                }
            }
        };

        /*
          Same opening pattern as your working CEZOO code.
        */
        const razorpay = new Razorpay(options);

        /*
          Hide our COD overlay before opening Razorpay,
          so it does not cover Checkout inside WebView.
        */
        if(paymentOverlay){
            paymentOverlay.classList.remove("open");
            paymentOverlay.style.display = "none";
        }

        codCheckoutOpening = false;

        razorpay.open();

    }catch(error){
        codCheckoutOpening = false;

        if(paymentOverlay){
            paymentOverlay.style.display = "";
            paymentOverlay.classList.add("open");
        }

        showCodPaymentError(
            error.message ||
            "Unable to open Razorpay payment."
        );

        console.error("Payment error:",error);
    }
};


/* Compatibility aliases */
window.openCodPaymentInPaytm =
    window.openCodRazorpayCheckout;

window.shareCodQr =
    window.openCodRazorpayCheckout;


function startCodPaymentPolling(qrId){
    stopCodPaymentPolling();

    checkCodPaymentStatus(qrId);

    codPaymentPollingTimer =
        setInterval(
            function(){
                checkCodPaymentStatus(qrId);
            },
            COD_PAYMENT_CHECK_INTERVAL
        );

    console.log("⚡ COD payment polling started:",qrId);
}

async function checkCodPaymentStatus(qrId){
    if(
        codPaymentCheckRunning ||
        !qrId ||
        qrId !== codPaymentQrId
    ){
        return;
    }

    codPaymentCheckRunning = true;

    try{
        const response =
            await fetch(
                `${COD_PAYMENT_BACKEND_URL}/payment-status/` +
                encodeURIComponent(qrId),
                {
                    method:"GET",
                    cache:"no-store"
                }
            );

        const result =
            await readCodJsonResponse(response);

        console.log("🔎 COD payment status:",result);

        if(
            !response.ok ||
            result.success !== true
        ){
            throw new Error(
                result.message ||
                "Unable to check payment status."
            );
        }

        if(
            result.paid === true &&
            result.status === "captured"
        ){
            completeCodPayment(result);
            return;
        }

        if(
            result.processing === true ||
            result.status === "authorized"
        ){
            document.getElementById("codStatusTitle").textContent =
                "Payment processing";

            document.getElementById("codStatusDescription").textContent =
                "Payment received. Waiting for capture.";

            return;
        }

        document.getElementById("codStatusTitle").textContent =
            "Waiting for payment";

        document.getElementById("codStatusDescription").textContent =
            "Complete payment in the UPI app.";

    }catch(error){
        console.error("COD status checking error:",error);

        document.getElementById("codStatusTitle").textContent =
            "Reconnecting";

        document.getElementById("codStatusDescription").textContent =
            "Payment check will retry automatically.";
    }finally{
        codPaymentCheckRunning = false;
    }
}

function completeCodPayment(paymentData){
    const order =
        visibleOrders[codPaymentOrderIndex];

    if(!order){
        return;
    }

    stopCodPaymentPolling();
    saveCodPaidOrder(order);

    /*
      Save payment information inside the local order object.
      This is also included in delivery_boy_stats at completion.
    */
    order.cod_payment = {
        paid:true,
        payment_id:
            paymentData.payment_id || null,
        qr_id:
            codPaymentQrId || null,
        razorpay_order_id:
            paymentData.razorpay_order_id ||
            codCheckoutOrderId ||
            null,
        razorpay_signature:
            paymentData.razorpay_signature ||
            null,
        amount:
            paymentData.amount ||
            Math.round(
                getFinalOrderTotal(order) * 100
            ),
        method:
            paymentData.method || "upi",
        paid_by:
            paymentData.paid_by ||
            (
                codPaymentMode === "phone"
                    ? "delivery_partner"
                    : "customer"
            ),
        captured_at:
            new Date().toISOString()
    };

    document.getElementById("codStatusIcon").innerHTML =
        '<i class="fa-solid fa-check"></i>';

    document.getElementById("codStatusIcon").style.background =
        "#dcfce7";

    document.getElementById("codStatusIcon").style.color =
        "#16a34a";

    document.getElementById("codSuccessMessage").textContent =
        `${formatMoney(getFinalOrderTotal(order))} received successfully. ` +
        `Now continue and upload delivery proof.`;

    setCodPaymentStep("codSuccessStep");

    console.log("✅ COD PAYMENT SUCCESS:",{
        orderId:order.order_id,
        ...order.cod_payment
    });

    if("vibrate" in navigator){
        navigator.vibrate([100,60,140]);
    }
}

window.skipCodPayment = function(){
    const index = codPaymentOrderIndex;
    const order = visibleOrders[index];
    const button = document.getElementById("codSkipPaymentBtn");

    if(!order){
        return;
    }

    if(button){
        button.disabled = true;
        button.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Updating Payment
        `;
    }

    stopCodPaymentPolling();

    /*
      Mark this COD order as paid using the same existing payment logic.
      submitDeliveredOrder() will then save payment_collected:true
      and this cod_payment object inside delivery_boy_stats.
    */
    completeCodPayment({
        paid:true,
        status:"captured",
        payment_id:null,
        amount:Math.round(getFinalOrderTotal(order) * 100),
        method:"manual_skip",
        paid_by:"delivery_partner",
        skipped:true
    });

    order.cod_payment.skipped = true;
    order.cod_payment.skipped_at = new Date().toISOString();

    console.log("⏭️ COD payment skipped and marked paid:",{
        orderId:order.order_id,
        payment:order.cod_payment
    });

    if(button){
        button.disabled = false;
        button.innerHTML = `
            <i class="fa-solid fa-forward"></i>
            Skip & Mark Payment Paid
        `;
    }

    continueToDeliveryProof();
};


window.continueToDeliveryProof = function(){
    const index = codPaymentOrderIndex;
    const order = visibleOrders[index];

    if(!order || !isCodOrderPaid(order)){
        return;
    }

    document
        .getElementById("codPaymentOverlay")
        .classList.remove("open");

    document.body.style.overflow = "";

    /*
      Keep the same visible-order index and open
      the existing delivery-proof flow.
    */
    openDeliveryProofSheet(index);

    console.log(
        "📸 COD payment completed; opening delivery proof"
    );
};


window.openDeliveryProofSheet =
function(index){

    const order =
        visibleOrders[index];

    if(!order){
        return;
    }

    deliveryProofOrderIndex = index;
    deliveryProofImageData = "";

    const input =
        document.getElementById(
            "deliveryProofInput"
        );

    const preview =
        document.getElementById(
            "deliveryProofPreview"
        );

    const placeholder =
        document.getElementById(
            "deliveryProofPlaceholder"
        );

    input.value = "";

    preview.removeAttribute("src");
    preview.style.display = "none";

    placeholder.style.display = "flex";

    document
        .getElementById(
            "deliveryProofOverlay"
        )
        .classList.add("open");

    document.body.style.overflow =
        "hidden";
};


window.closeDeliveryProofSheet =
function(){

    if(deliveryProofSubmitting){
        return;
    }

    document
        .getElementById(
            "deliveryProofOverlay"
        )
        .classList.remove("open");

    document.body.style.overflow = "";

    deliveryProofOrderIndex = null;
    deliveryProofImageData = "";
};


document
    .getElementById("deliveryProofOverlay")
    .addEventListener(
        "click",
        closeDeliveryProofSheet
    );


document
    .getElementById("deliveryProofInput")
    .addEventListener(
        "change",
        function(event){

            const file =
                event.target.files?.[0];

            if(!file){
                return;
            }

            if(!file.type.startsWith("image/")){
                event.target.value = "";
                return;
            }

            /*
              Compress the photo before saving.
              This avoids storing a very large image.
            */
            const reader =
                new FileReader();

            reader.onload =
                function(loadEvent){

                    const sourceImage =
                        new Image();

                    sourceImage.onload =
                        function(){

                            const maximumWidth = 900;
                            const maximumHeight = 900;

                            let width =
                                sourceImage.width;

                            let height =
                                sourceImage.height;

                            const scale =
                                Math.min(
                                    maximumWidth / width,
                                    maximumHeight / height,
                                    1
                                );

                            width =
                                Math.round(
                                    width * scale
                                );

                            height =
                                Math.round(
                                    height * scale
                                );

                            const canvas =
                                document.createElement(
                                    "canvas"
                                );

                            canvas.width = width;
                            canvas.height = height;

                            const context =
                                canvas.getContext("2d");

                            context.drawImage(
                                sourceImage,
                                0,
                                0,
                                width,
                                height
                            );

                            deliveryProofImageData =
                                canvas.toDataURL(
                                    "image/jpeg",
                                    .72
                                );

                            const preview =
                                document.getElementById(
                                    "deliveryProofPreview"
                                );

                            preview.src =
                                deliveryProofImageData;

                            preview.style.display =
                                "block";

                            document
                                .getElementById(
                                    "deliveryProofPlaceholder"
                                )
                                .style.display =
                                    "none";
                        };

                    sourceImage.src =
                        loadEvent.target.result;
                };

            reader.readAsDataURL(file);
        }
    );

    async function uploadDeliveryProofImage(
    order,
    imageData
){

    if(!imageData){
        return null;
    }

    /*
      Convert compressed Base64 image
      into a Blob for Supabase Storage.
    */
    const response =
        await fetch(imageData);

    const imageBlob =
        await response.blob();

    const safeOrderId =
        String(order.order_id || Date.now())
            .replace(/[^a-zA-Z0-9_-]/g,"_");

    const deliveryBoyMobile =
        String(
            currentDeliveryBoy?.mobile ||
            "unknown"
        )
        .replace(/\D/g,"");

    const extension =
        imageBlob.type === "image/png"
            ? "png"
            : imageBlob.type === "image/webp"
                ? "webp"
                : "jpg";

    const filePath =
        `${deliveryBoyMobile}/` +
        `${safeOrderId}-` +
        `${Date.now()}.${extension}`;

    const {error:uploadError} =
        await ordersSupabase
            .storage
            .from("delivery-proofs")
            .upload(
                filePath,
                imageBlob,
                {
                    contentType:
                        imageBlob.type ||
                        "image/jpeg",

                    cacheControl:"3600",

                    upsert:false
                }
            );

    if(uploadError){
        throw uploadError;
    }

    const {data:urlData} =
        ordersSupabase
            .storage
            .from("delivery-proofs")
            .getPublicUrl(filePath);

    const publicUrl =
        urlData?.publicUrl || "";

    if(!publicUrl){
        throw new Error(
            "Could not create delivery proof URL"
        );
    }

    return publicUrl;
}
    window.submitDeliveredOrder =
async function(){

    if(deliveryProofSubmitting){
        return;
    }

    const order =
        visibleOrders[
            deliveryProofOrderIndex
        ];

    if(!order || !currentDeliveryBoy){
        return;
    }

    const deliveryTable =
        order._order_type === "upi"
            ? "delivery_upi_orders"
            : "delivery_cash_orders";

    const originalTable =
        order._order_type === "upi"
            ? "upi_orders"
            : "cash_delivery_orders";

    const submitButton =
        document.getElementById(
            "submitDeliveryProofBtn"
        );

    const oldHtml =
        submitButton.innerHTML;

    deliveryProofSubmitting = true;
    submitButton.disabled = true;

    submitButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Submitting
    `;

    const earning =
        getDeliveryBoyEarning(order);

    const deliveredAt =
        new Date().toISOString();

    const previousStats =
        order.delivery_boy_stats &&
        typeof order.delivery_boy_stats === "object"
            ? order.delivery_boy_stats
            : {};

    const updatedStats = {
        ...previousStats,

        earnings:
            earning.total,

        distance_earning:
            earning.distanceEarning,

        item_bonus:
            earning.itemBonus,

        tip_earning:
            earning.deliveryTip,

        total_items:
            earning.totalItems,

        delivered_at:
            deliveredAt,

        delivery_proof_added:
            Boolean(deliveryProofImageData),

        cod_payment:
            order.cod_payment || null,

        payment_collected:
            order._order_type === "cash"
                ? isCodOrderPaid(order)
                : true,


        updated_at:
            deliveredAt
    };

   try{

    ignoreLocationRealtimeUntil =
        Date.now() + 4500;

    let deliveryProofUrl = null;

if(deliveryProofImageData){

    submitButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Uploading Photo
    `;

    deliveryProofUrl =
        await uploadDeliveryProofImage(
            order,
            deliveryProofImageData
        );
}

    submitButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Completing Order
    `;

    const {error:deliveryError} =
        await ordersSupabase
            .from(deliveryTable)
            .update({
                delivery_status:
                    "delivered",

                payment_status:
                    "paid",

                delivered_at:
                    deliveredAt,

                delivery_proof_image:
                    deliveryProofUrl,

                delivery_boy_earnings:
                    earning.total,

                delivery_boy_stats:
                    updatedStats
            })
            .eq(
                "order_id",
                order.order_id
            )
            .eq(
                "delivery_boy_mobile",
                currentDeliveryBoy.mobile
            );

    if(deliveryError){
        throw deliveryError;
    }

    const {error:customerError} =
        await ordersSupabase
            .from(originalTable)
            .update({
                order_status:"delivered",
                payment_status:"paid"
            })
            .eq(
                "order_id",
                order.order_id
            );

    if(customerError){
        console.error(
            "Customer status update error:",
            customerError
        );
    }

    stopDeliveryLocationTracking();

    /*
      Smoothly remove the completed card.
      Do not flash shimmer or rebuild the current screen.
    */
    const completedCard =
        availableOrdersList.querySelector(".orderCard");

    if(completedCard){

        completedCard.style.transition =
            "opacity .22s ease, transform .22s ease";

        completedCard.style.opacity = "0";
        completedCard.style.transform =
            "translateY(-8px)";

        await new Promise(resolve =>
            setTimeout(resolve,220)
        );
    }

    /*
      Ignore the realtime echo generated by our own delivered update,
      then silently prepare the next queued order.
    */
    ignoreLocationRealtimeUntil =
        Date.now() + 2500;

    await loadOrders({silent:true});

    if(order._order_type === "cash"){
        codPaidOrders.delete(
            `${order._order_type}:${order.order_id}`
        );
        localStorage.setItem(
            "cezooCodPaidOrders",
            JSON.stringify([...codPaidOrders])
        );
    }

    document
        .getElementById(
            "deliveryProofOverlay"
        )
        .classList.remove("open");

    showCompletedOrderEarning(
        earning.total
    );

}catch(error){

    console.error(
        "Delivery proof upload error:",
        error
    );

    submitButton.disabled = false;
    submitButton.innerHTML = "Submit";

    deliveryProofSubmitting = false;
}
};
function showCompletedOrderEarning(
    earningAmount
){

    clearTimeout(
        deliveryEarningCloseTimer
    );

    document
        .getElementById(
            "completedOrderEarning"
        )
        .textContent =
            formatMoney(earningAmount);

    document
        .getElementById(
            "deliveryEarningOverlay"
        )
        .classList.add("open");

    document.body.style.overflow =
        "hidden";

    deliveryEarningCloseTimer =
        setTimeout(
            async function(){

                document
                    .getElementById(
                        "deliveryEarningOverlay"
                    )
                    .classList.remove("open");

                document.body.style.overflow =
                    "";

                deliveryProofSubmitting =
                    false;

                deliveryProofOrderIndex =
                    null;

                deliveryProofImageData =
                    "";

                const submitButton =
                    document.getElementById(
                        "submitDeliveryProofBtn"
                    );

                submitButton.disabled =
                    false;

                submitButton.innerHTML =
                    "Submit";

                /*
                  The next order was already loaded silently as soon as
                  the previous order was completed.
                */

            },
            3000
        );
}
window.updateDeliveryStatus =
async function(index,newStatus,button){

    const order =
        visibleOrders[index];

    if(!order || !currentDeliveryBoy || !button){
        return;
    }

    const deliveryTable =
        order._order_type === "upi"
            ? "delivery_upi_orders"
            : "delivery_cash_orders";

    const originalTable =
        order._order_type === "upi"
            ? "upi_orders"
            : "cash_delivery_orders";

    const oldHtml =
        button.innerHTML;

    const oldClass =
        button.className;

    const normalizedStatus =
        String(newStatus || "")
            .toLowerCase()
            .trim();

    /*
      Prevent the realtime subscription from rebuilding this card
      when the change was made by THIS device.
    */
    ignoreLocationRealtimeUntil =
        Date.now() + 2500;

    button.disabled = true;

    button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
    `;

    try{

        /*
          IMPORTANT:
          Only update delivery_status here.

          Do NOT send picked_up_at / on_the_way_at because those
          columns are not present in the current delivery tables and
          Supabase returns HTTP 400 for unknown columns.
        */
        const updateData = {
            delivery_status: normalizedStatus
        };

        const {error} =
            await ordersSupabase
                .from(deliveryTable)
                .update(updateData)
                .eq("order_id",order.order_id)
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                );

        if(error){
            throw error;
        }

        const customerStatusMap = {
            picked_up:"packed",
            on_the_way:"on_the_way",
            delivered:"delivered"
        };

        const customerStatus =
            customerStatusMap[normalizedStatus];

        if(customerStatus){

            const {error:customerStatusError} =
                await ordersSupabase
                    .from(originalTable)
                    .update({
                        order_status:customerStatus
                    })
                    .eq(
                        "order_id",
                        order.order_id
                    );

            if(customerStatusError){
                console.error(
                    "Customer status update error:",
                    customerStatusError
                );
            }
        }

        /*
          Update local state immediately.
          No loadOrders(), no shimmer, no card rebuild.
        */
        order.delivery_status =
            normalizedStatus;

        const activeMatch =
            activeOrders.find(function(item){
                return (
                    String(item.order_id) ===
                    String(order.order_id) &&
                    String(item._order_type) ===
                    String(order._order_type)
                );
            });

        if(activeMatch){
            activeMatch.delivery_status =
                normalizedStatus;
        }

        const myMatch =
            myOrders.find(function(item){
                return (
                    String(item.order_id) ===
                    String(order.order_id) &&
                    String(item._order_type) ===
                    String(order._order_type)
                );
            });

        if(myMatch){
            myMatch.delivery_status =
                normalizedStatus;
        }

        /*
          Smooth button transition.
        */
        button.style.transition =
            "opacity .16s ease, transform .16s ease";

        button.style.opacity = "0";
        button.style.transform = "translateY(3px)";

        await new Promise(resolve =>
            setTimeout(resolve,160)
        );

        if(normalizedStatus === "picked_up"){

            button.className =
                "orderActionBtn way";

            button.setAttribute(
                "onclick",
                `updateDeliveryStatus(${index},'on_the_way',this)`
            );

            button.innerHTML = `
                <i class="fa-solid fa-motorcycle"></i>
                On The Way
            `;

        }else if(normalizedStatus === "on_the_way"){

            button.className =
                "orderActionBtn delivered";

            button.setAttribute(
                "onclick",
                `handleDeliveredClick(${index})`
            );

            button.innerHTML = `
                <i class="fa-solid fa-circle-check"></i>
                Delivered
            `;

        }else{

            button.className =
                oldClass;

            button.innerHTML =
                oldHtml;
        }

        button.disabled = false;

        requestAnimationFrame(function(){
            button.style.opacity = "1";
            button.style.transform = "translateY(0)";
        });

        updateActiveOrdersLimit();

    }catch(error){

        console.error(
            "Update status error:",
            {
                message: error?.message,
                details: error?.details,
                hint: error?.hint,
                code: error?.code,
                raw: error
            }
        );

        button.disabled = false;
        button.className = oldClass;
        button.innerHTML = oldHtml;
        button.style.opacity = "1";
        button.style.transform = "translateY(0)";
    }
};


function subscribeToOrdersRealtime(){

    if(!currentDeliveryBoy){
        return;
    }

    if(ordersRealtimeChannel){
        ordersSupabase.removeChannel(ordersRealtimeChannel);
    }

    if(customerOrderStatusChannel){
        ordersSupabase.removeChannel(customerOrderStatusChannel);
    }

    /*
      Delivery-assignment tables:
      used for newly assigned/accepted delivery rows.
    */
    ordersRealtimeChannel =
        ordersSupabase
            .channel(
                "delivery-orders-live-" +
                currentDeliveryBoy.mobile +
                "-" + Date.now()
            )
            .on(
                "postgres_changes",
                {
                    event:"*",
                    schema:"public",
                    table:"delivery_cash_orders"
                },
                function(payload){
                    console.log("⚡ delivery_cash_orders changed",payload);
                    scheduleOrdersReload(payload);
                }
            )
            .on(
                "postgres_changes",
                {
                    event:"*",
                    schema:"public",
                    table:"delivery_upi_orders"
                },
                function(payload){
                    console.log("⚡ delivery_upi_orders changed",payload);
                    scheduleOrdersReload(payload);
                }
            )
            .subscribe(function(status){
                console.log("📡 Delivery tables realtime:",status);
            });

    /*
      IMPORTANT:
      Watch order_status from the ORIGINAL customer tables.

      Cash  -> cash_delivery_orders.order_status
      UPI   -> upi_orders.order_status
    */
    customerOrderStatusChannel =
        ordersSupabase
            .channel(
                "customer-order-status-live-" +
                currentDeliveryBoy.mobile +
                "-" + Date.now()
            )
            .on(
                "postgres_changes",
                {
                    event:"UPDATE",
                    schema:"public",
                    table:"cash_delivery_orders"
                },
                function(payload){
                    handleCustomerOrderStatusRealtime(
                        payload,
                        "cash"
                    );
                }
            )
            .on(
                "postgres_changes",
                {
                    event:"UPDATE",
                    schema:"public",
                    table:"upi_orders"
                },
                function(payload){
                    handleCustomerOrderStatusRealtime(
                        payload,
                        "upi"
                    );
                }
            )
            .subscribe(function(status){
                console.log("📡 Customer order_status realtime:",status);
            });
}


function normalizeOrderStatus(value){
    return String(value || "")
        .trim()
        .toLowerCase()
        .replaceAll("-","_")
        .replaceAll(" ","_");
}


function isCurrentPartnerOrder(row){

    if(!row || !currentDeliveryBoy){
        return false;
    }

    const rowMobile =
        String(row.delivery_boy_mobile || "")
            .replace(/\D/g,"")
            .slice(-10);

    const partnerMobile =
        String(currentDeliveryBoy.mobile || "")
            .replace(/\D/g,"")
            .slice(-10);

    if(rowMobile && partnerMobile && rowMobile === partnerMobile){
        return true;
    }

    const orderId = String(row.order_id || row.id || "");

    return activeOrders.some(function(order){
        return String(order.order_id || order.id || "") === orderId;
    });
}


async function handleCustomerOrderStatusRealtime(payload,orderType){

    const newRow = payload?.new || {};
    const oldRow = payload?.old || {};

    const orderId = String(
        newRow.order_id ||
        oldRow.order_id ||
        newRow.id ||
        oldRow.id ||
        ""
    );

    const oldStatus = normalizeOrderStatus(oldRow.order_status);
    const newStatus = normalizeOrderStatus(newRow.order_status);

    console.log("⚡ CUSTOMER ORDER STATUS LIVE",{
        table:orderType === "upi" ? "upi_orders" : "cash_delivery_orders",
        orderId,
        oldStatus,
        newStatus,
        payload
    });

    if(!isCurrentPartnerOrder(newRow)){
        console.log("ℹ️ Status belongs to another delivery partner; ignored",orderId);
        return;
    }

    /*
      If customer/admin cancels at any point during delivery,
      immediately stop tracking and show the red alert.
    */
    if(newStatus === "cancelled" || newStatus === "canceled"){
        await handleLiveOrderCancelled(orderId,orderType,newRow);
        return;
    }

    /*
      For every other order_status update, refresh immediately
      so the latest database state is visible without delay.
    */
    if(newStatus && newStatus !== oldStatus){
        console.log("✅ Live status updated:",newStatus);
        await loadOrdersSilently();
    }
}


async function handleLiveOrderCancelled(orderId,orderType,row){

    if(
        cancelledAlertOrderId === orderId &&
        document.getElementById("orderCancelledOverlay")
            ?.classList.contains("open")
    ){
        return;
    }

    cancelledAlertOrderId = orderId;
    cancelledAlertOrderType = orderType;

    console.error("❌ ACTIVE ORDER CANCELLED LIVE",{
        orderId,
        orderType,
        orderStatus:row.order_status
    });

    stopDeliveryLocationTracking();

    /*
      Keep the delivery mirror table consistent too.
      This is best-effort; the red alert still works even if
      RLS prevents this update.
    */
    const deliveryTable =
        orderType === "upi"
            ? "delivery_upi_orders"
            : "delivery_cash_orders";

    try{
        const {error} = await ordersSupabase
            .from(deliveryTable)
            .update({delivery_status:"cancelled"})
            .eq("order_id",orderId);

        if(error){
            console.warn("Could not sync delivery_status cancellation:",error);
        }
    }catch(error){
        console.warn("Cancellation sync failed:",error);
    }

    availableOrders = availableOrders.filter(function(order){
        return String(order.order_id) !== orderId;
    });

    myOrders = myOrders.filter(function(order){
        return String(order.order_id) !== orderId;
    });

    activeOrders = activeOrders.filter(function(order){
        return String(order.order_id) !== orderId;
    });

    visibleOrders = visibleOrders.filter(function(order){
        return String(order.order_id) !== orderId;
    });

    const idElement = document.getElementById("orderCancelledOrderId");
    if(idElement){
        idElement.textContent = "Order #" + orderId;
    }

    document.body.style.overflow = "hidden";

    document.getElementById("orderCancelledOverlay")
        ?.classList.add("open");

    if("vibrate" in navigator){
        navigator.vibrate([250,100,250,100,350]);
    }
}


async function closeCancelledOrderAlert(){

    document.getElementById("orderCancelledOverlay")
        ?.classList.remove("open");

    document.body.style.overflow = "";

    console.log("🔎 Cancelled order removed. Searching for another order...",{
        orderId:cancelledAlertOrderId,
        orderType:cancelledAlertOrderType
    });

    cancelledAlertOrderId = null;
    cancelledAlertOrderType = null;

    await loadOrders({silent:true});
}


document.getElementById("orderCancelledOkBtn")
    ?.addEventListener("click",closeCancelledOrderAlert);


async function loadOrdersSilently(){
    await loadOrders({silent:true});
}


function scheduleOrdersReload(payload){

    if(!localStorage.getItem(DUTY_START_KEY)){
        return;
    }

    console.log("⚡ Instant delivery-table reload",payload);

    clearTimeout(ordersReloadTimer);

    /* No artificial delay. */
    loadOrders({silent:true});
}

function stopOrdersSystem(){

    if(ordersRealtimeChannel){
        ordersSupabase.removeChannel(
            ordersRealtimeChannel
        );

        ordersRealtimeChannel = null;
    }

    if(customerOrderStatusChannel){
        ordersSupabase.removeChannel(
            customerOrderStatusChannel
        );

        customerOrderStatusChannel = null;
    }

    availableOrders = [];
    myOrders = [];
    activeOrders = [];
    visibleOrders = [];

    document.getElementById("dutyOrdersSection")
        .style.display = "none";

    document.querySelector(".main")
        .classList.remove("duty-active");
}



function openProfile(){

    /*
      Open immediately, then refresh the real profile details silently.
    */
    loadProfileDetails();

    document
        .getElementById("profileOverlay")
        .classList.add("open");

    document.body.style.overflow = "hidden";

}

function closeProfile(){

    document
        .getElementById("profileOverlay")
        .classList.remove("open");

    document.body.style.overflow = "";

}

async function loadProfileDetails(){

    const nameElement =
        document.getElementById(
            "profileName"
        );

    const mobileElement =
        document.getElementById(
            "profileMobile"
        );

    let deliveryBoy = null;

    try{
        deliveryBoy =
            JSON.parse(
                localStorage.getItem(
                    "deliveryBoy"
                ) || "null"
            );
    }catch(error){
        deliveryBoy = null;
    }


    const savedMobile =
        String(
            localStorage.getItem(
                "partner_mobile"
            ) || ""
        )
        .replace(/\D/g,"")
        .trim();


    const cachedName =
        String(
            localStorage.getItem(
                "partner_full_name"
            ) || ""
        )
        .trim();


    const visibleName =
        String(
            nameElement?.textContent ||
            ""
        )
        .trim();


    /*
      Priority:
      1. verified deliveryBoy cache
      2. stable partner_full_name cache
      3. currently visible REAL name

      Never write "Delivery Partner" over an already real name.
    */
    let name =
        String(
            deliveryBoy?.name ||
            deliveryBoy?.full_name ||
            cachedName ||
            (
                visibleName &&
                visibleName !== "Delivery Partner"
                    ? visibleName
                    : ""
            )
        )
        .trim();


    const mobile =
        String(
            deliveryBoy?.mobile ||
            savedMobile ||
            ""
        )
        .replace(/\D/g,"")
        .trim();


    if(name && name !== "Delivery Partner"){

        if(nameElement){
            nameElement.textContent =
                name;
        }

        localStorage.setItem(
            "partner_full_name",
            name
        );
    }


    if(
        mobileElement &&
        mobile
    ){
        mobileElement.textContent =
            "+91 " + mobile;
    }


    /*
      If localStorage is stale/missing, quietly fetch the approved
      application again. This prevents sheet openings from showing
      the generic placeholder after some time.
    */
    if(
        (!name || name === "Delivery Partner") &&
        mobile
    ){

        try{

            const {
                data,
                error
            } =
                await partnerSupabase
                    .from(
                        "delivery_partner_applications"
                    )
                    .select(
                        "id,full_name,mobile,status"
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


            if(error){
                console.warn(
                    "Profile name refresh failed:",
                    error
                );
            }else if(data){

                const realName =
                    String(
                        data.full_name ||
                        ""
                    )
                    .trim();

                if(realName){

                    name =
                        realName;

                    if(nameElement){
                        nameElement.textContent =
                            realName;
                    }

                    localStorage.setItem(
                        "partner_full_name",
                        realName
                    );

                    const mergedDeliveryBoy = {
                        ...(deliveryBoy || {}),
                        id:
                            deliveryBoy?.id ||
                            data.id ||
                            localStorage.getItem(
                                "delivery_boy_uuid"
                            ) ||
                            "",
                        name:
                            realName,
                        mobile:
                            data.mobile ||
                            mobile
                    };

                    localStorage.setItem(
                        "deliveryBoy",
                        JSON.stringify(
                            mergedDeliveryBoy
                        )
                    );
                }
            }

        }catch(error){

            console.warn(
                "Profile real-name lookup failed:",
                error
            );
        }
    }


    /*
      Earnings are owned by earnings.script.js.
      Never replace the live earnings value when a sheet opens.
    */
    if(
        typeof window.refreshDeliveryPartnerEarnings ===
            "function"
    ){
        window.refreshDeliveryPartnerEarnings();
    }
}


function openYourOrders(){

    if(
        typeof window.openDeliveryEarningsOrders ===
        "function"
    ){
        return window.openDeliveryEarningsOrders();
    }

    console.warn(
        "Your Orders module is not loaded yet"
    );
}


function openCancelledOrders(){

    if(
        typeof window.openCezooCancelledOrders ===
        "function"
    ){
        return window.openCezooCancelledOrders();
    }

    console.warn(
        "Cancelled Orders module is not loaded yet"
    );
}


function openAttendance(){

    /*
      The newer attendance module replaces window.openAttendance
      after this file loads. Keep this fallback non-blocking.
    */
    console.warn(
        "Attendance module is not loaded yet"
    );
}


function openFAQ(){

    if(
        typeof window.openCezooFAQ ===
        "function"
    ){
        return window.openCezooFAQ();
    }

    console.warn(
        "FAQ module is not loaded yet"
    );
}

function openTerms(){

    closeProfile();

    document
        .getElementById("termsPage")
        .classList.add("open");

    document.body.style.overflow = "hidden";
}


function closeTerms(){

    document
        .getElementById("termsPage")
        .classList.remove("open");

    document.body.style.overflow = "";
}

function openPrivacy(){

    console.warn(
        "Privacy module is not loaded yet"
    );

}

function openSupport(){

    if(
        typeof window.openCezooSupportChat ===
        "function"
    ){
        return window.openCezooSupportChat(
            "support"
        );
    }

    console.warn(
        "Support module is not loaded yet"
    );

}

function logoutUser(){

    stopDeliveryLocationTracking();

    localStorage.removeItem("partner_mobile");
    localStorage.removeItem("deliveryBoy");
    localStorage.removeItem("delivery_boy_uuid");

    sessionStorage.removeItem("cezoo_just_submitted_application");

    // Clear OTP
    if(typeof window.clearOTP === "function"){
        window.clearOTP();
    }

    // Reset LOGIN screen to mobile-number screen
    const mobileScreen =
        document.getElementById("mobileScreen");

    const otpScreen =
        document.getElementById("otpScreen");

    const loginMobile =
        document.querySelector("#loginPage #mobile");

    if(loginMobile){
        loginMobile.value = "";
    }

    if(mobileScreen){
        mobileScreen.style.display = "block";
    }

    if(otpScreen){
        otpScreen.style.display = "none";
    }

    closeProfile();

    // SPA — no reload
    window.showPage("login");
}
document
    .getElementById("profileOverlay")
    .addEventListener("click",function(event){

        if(event.target === this){
            closeProfile();
        }

    });

document.addEventListener("keydown",function(event){

    if(event.key === "Escape"){
        closeProfile();
    }

});
/* =========================
   SWIPE TO CLOSE PROFILE
========================= */

let profileStartX = 0;
let profileStartY = 0;
let profileDragging = false;

const profileDrawer =
    document.querySelector(".profileDrawer");

profileDrawer.addEventListener("touchstart",function(e){

    const touch = e.touches[0];

    profileStartX = touch.clientX;
    profileStartY = touch.clientY;

    profileDragging = profileStartX <= 40;

},{passive:true});


profileDrawer.addEventListener("touchmove",function(e){

    if(!profileDragging){
        return;
    }

    const touch = e.touches[0];

    const dx = touch.clientX - profileStartX;
    const dy = Math.abs(touch.clientY - profileStartY);

    if(dx > 80 && dy < 50){

        profileDragging = false;

        closeProfile();

    }

},{passive:true});


profileDrawer.addEventListener("touchend",function(){

    profileDragging = false;

});
/* =========================
   DUTY TIMER
========================= */

let dutyInterval = null;

const DUTY_START_KEY =
    "cezooDutyStartTime";

const DUTY_SESSION_KEY =
    "cezooDutySessionId";

const DUTY_START_ISO_KEY =
    "cezooDutyStartIso";

function formatDutyTime(totalSeconds){

    totalSeconds =
        Math.max(0,Math.floor(totalSeconds));

    const hours =
        String(
            Math.floor(totalSeconds / 3600)
        ).padStart(2,"0");

    const minutes =
        String(
            Math.floor(
                (totalSeconds % 3600) / 60
            )
        ).padStart(2,"0");

    const seconds =
        String(
            totalSeconds % 60
        ).padStart(2,"0");

    return `${hours}:${minutes}:${seconds}`;
}


function updateDutyTimer(){

    const savedStartTime =
        Number(
            localStorage.getItem(DUTY_START_KEY)
        );

    if(!savedStartTime){
        return;
    }

    const elapsedSeconds =
        Math.floor(
            (Date.now() - savedStartTime) / 1000
        );

    document
        .getElementById("dutyTime")
        .textContent =
            formatDutyTime(elapsedSeconds);
}


function showDutyRunning(){

    const startButton =
        document.querySelector(".startBtn");

    const dutyTimer =
        document.getElementById("dutyTimer");

    if(startButton){
        startButton.style.display = "none";
    }

    dutyTimer.style.display = "flex";

    updateDutyTimer();

    clearInterval(dutyInterval);

    dutyInterval =
        setInterval(
            updateDutyTimer,
            1000
        );
}

function getOrCreateDutySession(){

    let sessionId =
        localStorage.getItem(DUTY_SESSION_KEY);

    if(!sessionId){

        sessionId =
            createDeliveryUuid();

        localStorage.setItem(
            DUTY_SESSION_KEY,
            sessionId
        );
    }

    return sessionId;
}


function getCurrentDutyDetails(){

    const startMilliseconds =
        Number(
            localStorage.getItem(DUTY_START_KEY)
        );

    const startIso =
        localStorage.getItem(DUTY_START_ISO_KEY);

    const sessionId =
        localStorage.getItem(DUTY_SESSION_KEY);

    const currentMilliseconds =
        Date.now();

    const dutySeconds =
        startMilliseconds
            ? Math.max(
                0,
                Math.floor(
                    (
                        currentMilliseconds -
                        startMilliseconds
                    ) / 1000
                )
            )
            : 0;

    return {
        sessionId,
        startMilliseconds,
        startIso,
        dutySeconds,
        dutyTimeText:
            formatDutyTime(dutySeconds)
    };
}


function buildDeliveryBoyStats(
    order,
    options = {}
){

    const duty =
        getCurrentDutyDetails();

    const earning =
        getDeliveryBoyEarning(order);

    const previousStats =
        order.delivery_boy_stats &&
        typeof order.delivery_boy_stats === "object"
            ? order.delivery_boy_stats
            : {};

    return {
        ...previousStats,

        duty_session_id:
            duty.sessionId,

        duty_started_at:
            duty.startIso,

        duty_start_local:
            duty.startIso
                ? new Date(
                    duty.startIso
                ).toLocaleString("en-IN")
                : null,

        duty_seconds:
            duty.dutySeconds,

        duty_time_text:
            duty.dutyTimeText,

        earnings:
            earning.total,

        distance_earning:
            earning.distanceEarning,

        item_bonus:
            earning.itemBonus,

        tip_earning:
            earning.deliveryTip,

        total_items:
            earning.totalItems,

        duty_status:
            options.ended
                ? "ended"
                : "running",

        duty_ended_at:
            options.ended
                ? options.endIso
                : (
                    previousStats.duty_ended_at ||
                    null
                ),

        duty_end_local:
            options.ended
                ? new Date(
                    options.endIso
                ).toLocaleString("en-IN")
                : (
                    previousStats.duty_end_local ||
                    null
                ),

        updated_at:
            new Date().toISOString()
    };
}


async function saveAcceptedOrderDutyStats(order){

    if(!order || !currentDeliveryBoy){
        return;
    }

    const deliveryTable =
        order._order_type === "upi"
            ? "delivery_upi_orders"
            : "delivery_cash_orders";

    const earning =
        getDeliveryBoyEarning(order);

    const stats =
        buildDeliveryBoyStats(order);

    /*
      Prevent the realtime listener from visually
      reloading the order after this update.
    */
    ignoreLocationRealtimeUntil =
        Date.now() + 2500;

    const {error} =
        await ordersSupabase
            .from(deliveryTable)
            .update({
                delivery_boy_earnings:
                    earning.total,

                delivery_boy_stats:
                    stats
            })
            .eq(
                "order_id",
                order.order_id
            )
            .eq(
                "delivery_boy_mobile",
                currentDeliveryBoy.mobile
            );

    if(error){
        console.error(
            "Save accepted-order earnings error:",
            error
        );

        throw error;
    }

    /*
      Update the local order object too.
    */
    order.delivery_boy_earnings =
        earning.total;

    order.delivery_boy_stats =
        stats;

    console.log(
        "💰 Accepted-order earnings saved:",
        {
            order_id:order.order_id,
            earnings:earning.total,
            duty:stats
        }
    );
}


async function finishDutyOrdersInDatabase(){

    if(!currentDeliveryBoy){
        return;
    }

    const duty =
        getCurrentDutyDetails();

    if(!duty.sessionId){
        return;
    }

    const endIso =
        new Date().toISOString();

    /*
      Read orders belonging to this delivery partner.
    */
    const [
        cashResponse,
        upiResponse
    ] = await Promise.all([

        ordersSupabase
            .from("delivery_cash_orders")
            .select(`
                order_id,
                delivery_distance,
                delivery_tip,
                delivery_partner_tip,
                items,
                delivery_boy_stats
            `)
            .eq(
                "delivery_boy_mobile",
                currentDeliveryBoy.mobile
            ),

        ordersSupabase
            .from("delivery_upi_orders")
            .select(`
                order_id,
                delivery_distance,
                delivery_tip,
                delivery_partner_tip,
                items,
                delivery_boy_stats
            `)
            .eq(
                "delivery_boy_mobile",
                currentDeliveryBoy.mobile
            )
    ]);

    if(cashResponse.error){
        throw cashResponse.error;
    }

    if(upiResponse.error){
        throw upiResponse.error;
    }

    const dutyCashOrders =
        (cashResponse.data || [])
            .filter(function(order){

                return (
                    order.delivery_boy_stats
                        ?.duty_session_id ===
                    duty.sessionId
                );
            });

    const dutyUpiOrders =
        (upiResponse.data || [])
            .filter(function(order){

                return (
                    order.delivery_boy_stats
                        ?.duty_session_id ===
                    duty.sessionId
                );
            });

    ignoreLocationRealtimeUntil =
        Date.now() + 4000;

    const updates = [];

    dutyCashOrders.forEach(function(order){

        const earning =
            getDeliveryBoyEarning(order);

        updates.push(
            ordersSupabase
                .from("delivery_cash_orders")
                .update({
                    delivery_boy_earnings:
                        earning.total,

                    delivery_boy_stats:
                        buildDeliveryBoyStats(
                            order,
                            {
                                ended:true,
                                endIso
                            }
                        )
                })
                .eq(
                    "order_id",
                    order.order_id
                )
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                )
        );
    });

    dutyUpiOrders.forEach(function(order){

        const earning =
            getDeliveryBoyEarning(order);

        updates.push(
            ordersSupabase
                .from("delivery_upi_orders")
                .update({
                    delivery_boy_earnings:
                        earning.total,

                    delivery_boy_stats:
                        buildDeliveryBoyStats(
                            order,
                            {
                                ended:true,
                                endIso
                            }
                        )
                })
                .eq(
                    "order_id",
                    order.order_id
                )
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                )
        );
    });

    const results =
        await Promise.all(updates);

    const failedUpdate =
        results.find(function(result){
            return result.error;
        });

    if(failedUpdate){
        throw failedUpdate.error;
    }

    console.log(
        "⏱️ Duty end saved:",
        {
            session_id:duty.sessionId,
            started_at:duty.startIso,
            ended_at:endIso,
            duty_seconds:duty.dutySeconds,
            duty_time:
                duty.dutyTimeText,
            orders_updated:
                updates.length
        }
    );
}
async function startDuty(){

    const existingStartTime =
        localStorage.getItem(DUTY_START_KEY);

    if(!existingStartTime){

        const startDate =
            new Date();

        localStorage.setItem(
            DUTY_START_KEY,
            String(startDate.getTime())
        );

        localStorage.setItem(
            DUTY_START_ISO_KEY,
            startDate.toISOString()
        );

        localStorage.setItem(
            DUTY_SESSION_KEY,
            createDeliveryUuid()
        );

        console.log(
            "⏱️ Duty started:",
            {
                session_id:
                    localStorage.getItem(
                        DUTY_SESSION_KEY
                    ),

                started_at:
                    startDate.toISOString(),

                local_time:
                    startDate.toLocaleString(
                        "en-IN"
                    )
            }
        );

    }else{

        /*
          Ensure older running duties also
          receive session and exact start values.
        */
        getOrCreateDutySession();

        if(
            !localStorage.getItem(
                DUTY_START_ISO_KEY
            )
        ){
            localStorage.setItem(
                DUTY_START_ISO_KEY,
                new Date(
                    Number(existingStartTime)
                ).toISOString()
            );
        }
    }

    showDutyRunning();

    document
        .querySelector(".main")
        .classList.add("duty-active");

    document
        .getElementById("dutyOrdersSection")
        .style.display = "block";

    showOrdersLoader();

    const verified =
        await initializeDeliveryBoy();

    if(!verified){
        return;
    }

    await loadOrders();
    subscribeToOrdersRealtime();
}

function showDutyGuardMessage(message){

    const box =
        document.getElementById(
            "dutyGuardMessage"
        );

    if(!box){
        return;
    }

    box.textContent =
        message ||
        "Complete the delivery before going off duty.";

    box.classList.add("show");

    clearTimeout(
        showDutyGuardMessage._timer
    );

    showDutyGuardMessage._timer =
        setTimeout(function(){
            box.classList.remove("show");
        },2600);
}


async function endDuty(){

    /*
      Do not allow the partner to go off duty while an accepted
      delivery is still active.

      Waiting/unaccepted orders do NOT block End Duty.
    */
    const hasActiveAcceptedOrder =
        activeOrders.some(function(order){

            const status =
                String(order.delivery_status || "")
                    .toLowerCase()
                    .trim();

            return (
                order.delivery_boy_accepted === true &&
                !["delivered","cancelled"].includes(status)
            );
        });

    if(hasActiveAcceptedOrder){

        showDutyGuardMessage(
            "Complete the delivery before going off duty."
        );

        return;
    }

    const endButton =
        document.getElementById(
            "endDutyBtn"
        );

    if(endButton){
        endButton.disabled = true;
        endButton.textContent =
            "Ending...";
    }

    try{

        /*
          Save exact end time and final duration
          to every order accepted in this duty.
        */
        await finishDutyOrdersInDatabase();

    }catch(error){

        console.error(
            "End duty save error:",
            error
        );

    }finally{

        stopDeliveryLocationTracking();

        clearInterval(dutyInterval);
        dutyInterval = null;

        localStorage.removeItem(
            DUTY_START_KEY
        );

        localStorage.removeItem(
            DUTY_START_ISO_KEY
        );

        localStorage.removeItem(
            DUTY_SESSION_KEY
        );

        document
            .getElementById("dutyTime")
            .textContent = "00:00:00";

        document
            .getElementById("dutyTimer")
            .style.display = "none";

        stopOrdersSystem();

        const startButton =
            document.querySelector(
                ".startBtn"
            );

        if(startButton){
            startButton.style.display =
                "flex";
        }

        if(endButton){
            endButton.disabled = false;
            endButton.textContent =
                "End Duty";
        }
    }
}
/* Restore running duty after refresh */

async function restoreDutyTimer(){

    const savedStartTime =
        Number(
            localStorage.getItem(DUTY_START_KEY)
        );

    if(savedStartTime){

        showDutyRunning();

        document.querySelector(".main")
            .classList.add("duty-active");

        document.getElementById("dutyOrdersSection")
            .style.display = "block";
availableOrdersList.innerHTML =
    getOrdersShimmer();
        const verified =
            await initializeDeliveryBoy();

        if(verified){
            await loadOrders();
            subscribeToOrdersRealtime();
        }

        return;
    }

    document.getElementById("dutyTimer")
        .style.display = "none";

    document.getElementById("dutyOrdersSection")
        .style.display = "none";

    const startButton =
        document.querySelector(".startBtn");

    if(startButton){
        startButton.style.display = "flex";
    }
}


document.addEventListener(
    "DOMContentLoaded",
    restoreDutyTimer
);
function getOrdersShimmer(){

    return `
        <div class="ordersCenterLoader" aria-label="Loading orders">
            <div class="ordersCenterSpinner"></div>
        </div>
    `;
}

/* =====================================================
   DELIVERY BOY LIVE LOCATION TRACKING
===================================================== */

let deliveryLocationWatchId = null;
let deliveryLocationTimer = null;
let latestDeliveryLocation = null;
let trackedDeliveryOrder = null;
let deliveryLocationUpdating = false;


function stopDeliveryLocationTracking(){

    if(deliveryLocationWatchId !== null){

        navigator.geolocation.clearWatch(
            deliveryLocationWatchId
        );

        deliveryLocationWatchId = null;
    }

    if(deliveryLocationTimer){

        clearInterval(deliveryLocationTimer);
        deliveryLocationTimer = null;
    }

    latestDeliveryLocation = null;
    trackedDeliveryOrder = null;
    deliveryLocationUpdating = false;

    console.log("📍 Delivery location tracking stopped");
}


async function saveDeliveryBoyLocation(){

    if(
        !trackedDeliveryOrder ||
        !latestDeliveryLocation ||
        deliveryLocationUpdating
    ){
        return;
    }

    const status =
        String(
            trackedDeliveryOrder.delivery_status || ""
        )
        .toLowerCase()
        .trim();

    if(
        status === "delivered" ||
        status === "cancelled"
    ){
        stopDeliveryLocationTracking();
        return;
    }

    deliveryLocationUpdating = true;

    const deliveryTable =
        trackedDeliveryOrder._order_type === "upi"
            ? "delivery_upi_orders"
            : "delivery_cash_orders";

    const locationData = {
        latitude:latestDeliveryLocation.latitude,
        longitude:latestDeliveryLocation.longitude,
        accuracy:latestDeliveryLocation.accuracy,
        heading:latestDeliveryLocation.heading,
        speed:latestDeliveryLocation.speed,
        updated_at:new Date().toISOString()
    };

    try{

        const {error} =
            await ordersSupabase
                .from(deliveryTable)
                .update({
                    delivery_boy_location:locationData
                })
                .eq(
                    "order_id",
                    trackedDeliveryOrder.order_id
                )
                .eq(
                    "delivery_boy_mobile",
                    currentDeliveryBoy.mobile
                );

        if(error){
    throw error;
}

/*
  Ignore the realtime event created by this location update.
  This prevents the whole order UI from reloading every 5 seconds.
*/
ignoreLocationRealtimeUntil =
    Date.now() + 2000;

console.log(
    "📍 Delivery location updated:",
    locationData
);

    }catch(error){

        console.error(
            "Delivery location update error:",
            error
        );

    }finally{

        deliveryLocationUpdating = false;
    }
}


function startDeliveryLocationTracking(order){

    if(!order || !navigator.geolocation){
        console.error("Location is not supported");
        return;
    }

    const status =
        String(order.delivery_status || "")
            .toLowerCase()
            .trim();

    if(
        status === "delivered" ||
        status === "cancelled"
    ){
        stopDeliveryLocationTracking();
        return;
    }

    stopDeliveryLocationTracking();

    trackedDeliveryOrder = order;

    deliveryLocationWatchId =
        navigator.geolocation.watchPosition(

            function(position){

                latestDeliveryLocation = {
                    latitude:position.coords.latitude,
                    longitude:position.coords.longitude,
                    accuracy:position.coords.accuracy,
                    heading:position.coords.heading,
                    speed:position.coords.speed
                };
            },

            function(error){

                console.error(
                    "Delivery location permission/error:",
                    error
                );
            },

            {
                enableHighAccuracy:true,
                maximumAge:0,
                timeout:15000
            }
        );

    /*
      Save immediately when location becomes available.
    */
    const firstLocationTimer =
        setInterval(function(){

            if(latestDeliveryLocation){

                clearInterval(firstLocationTimer);
                saveDeliveryBoyLocation();
            }

        },500);

    /*
      Update Supabase every second.
      The old JSON value is replaced by the latest location.
    */
    deliveryLocationTimer =
        setInterval(
            saveDeliveryBoyLocation,
            LOCATION_SYNC_INTERVAL
        );

    console.log(
        "📍 Delivery location tracking started for:",
        order.order_id
    );
}



/* =====================================================
   CEZOO SMOOTH DOM SYNC + UNLIMITED-ORDER SILENT LOCATION
===================================================== */
function syncOrdersDom(nextHtml){

    /*
      Always remove every loader before syncing real order content.
      This fixes the center spinner staying visible under the card.
    */
    removeOrdersLoader();

    const template = document.createElement("template");
    template.innerHTML = String(nextHtml || "").trim();

    const nextCards = [...template.content.querySelectorAll(".orderCard")];
    const currentCards = [...availableOrdersList.querySelectorAll(".orderCard")];

    if(nextCards.length === 0){

        removeOrdersLoader();

        if(!availableOrdersList.querySelector(".searchingOrders")){
            availableOrdersList.innerHTML = `
                <div class="searchingOrders">
                    <i class="fa fa-search searchingIcon"></i>
                    <h3>Searching for Orders...</h3>
                    <p>Stay online to receive new delivery requests.</p>
                </div>`;
        }

        return;
    }

    availableOrdersList.querySelector(".searchingOrders")?.remove();

    removeOrdersLoader();

    const currentByKey = new Map(
        currentCards.map(card => [card.dataset.orderKey,card])
    );
    const nextKeys = new Set(nextCards.map(card => card.dataset.orderKey));

    currentCards.forEach(function(card){
        if(!nextKeys.has(card.dataset.orderKey)){
            card.style.opacity = "0";
            card.style.transform = "translateY(-6px)";
            setTimeout(() => card.remove(),180);
        }
    });

    nextCards.forEach(function(nextCard,index){
        const key = nextCard.dataset.orderKey;
        const existing = currentByKey.get(key);

        if(existing){
            if(existing.innerHTML !== nextCard.innerHTML){
                existing.innerHTML = nextCard.innerHTML;
            }
            const reference = availableOrdersList.children[index];
            if(reference !== existing){
                availableOrdersList.insertBefore(existing,reference || null);
            }
        }else{
            nextCard.classList.add("order-enter");
            const reference = availableOrdersList.children[index];
            availableOrdersList.insertBefore(nextCard,reference || null);
            requestAnimationFrame(function(){
                nextCard.classList.remove("order-enter");
            });
        }
    });
}

function getActiveAcceptedOrders(){
    return activeOrders.filter(function(order){
        const status = String(order.delivery_status || "").toLowerCase().trim();
        return order.delivery_boy_accepted === true && !["delivered","cancelled"].includes(status);
    });
}

function updateActiveOrdersLimit(){
    const count = getActiveAcceptedOrders().length;
    const badge = document.getElementById("activeOrdersLimit");
    if(badge){
        badge.textContent = count + (count === 1 ? " active order" : " active orders");
    }
}

function updateLocationStatus(success,message){
    const title = document.getElementById("locationUpdateTitle");
    const time = document.getElementById("locationUpdateTime");
    const icon = document.querySelector(".locationUpdateIcon i");

    if(title){
        title.textContent = success ? "Location updated silently" : "Location update paused";
    }
    if(time){
        time.textContent = message || "Waiting for GPS update";
    }
    if(icon){
        icon.className = success
            ? "fa-solid fa-location-crosshairs"
            : "fa-solid fa-location-dot";
    }
}

function refreshLocationStatusAge(){
    if(!lastLocationSavedAt){ return; }
    const seconds = Math.max(0,Math.floor((Date.now()-lastLocationSavedAt)/1000));
    const text = seconds < 2 ? "Updated just now" : `Updated ${seconds} seconds ago`;
    const node = document.getElementById("locationUpdateTime");
    if(node){ node.textContent = text; }
}

if(!locationStatusClock){
    locationStatusClock = setInterval(refreshLocationStatusAge,1000);
}

stopDeliveryLocationTracking = function(){
    if(deliveryLocationWatchId !== null && navigator.geolocation){
        navigator.geolocation.clearWatch(deliveryLocationWatchId);
        deliveryLocationWatchId = null;
    }
    if(deliveryLocationTimer){
        clearInterval(deliveryLocationTimer);
        deliveryLocationTimer = null;
    }
    latestDeliveryLocation = null;
    trackedDeliveryOrder = null;
    deliveryLocationUpdating = false;
    updateLocationStatus(false,"Duty location sharing stopped");
};

saveDeliveryBoyLocation = async function(){
    if(!latestDeliveryLocation || deliveryLocationUpdating || !currentDeliveryBoy){
        return;
    }

    const trackableOrders = getActiveAcceptedOrders();
    if(trackableOrders.length === 0){
        updateActiveOrdersLimit();
        return;
    }

    deliveryLocationUpdating = true;
    const locationData = {
        latitude:latestDeliveryLocation.latitude,
        longitude:latestDeliveryLocation.longitude,
        accuracy:latestDeliveryLocation.accuracy,
        heading:latestDeliveryLocation.heading,
        speed:latestDeliveryLocation.speed,
        updated_at:new Date().toISOString()
    };

    try{
        const results = await Promise.all(
            trackableOrders.map(function(order){
                const table = order._order_type === "upi"
                    ? "delivery_upi_orders"
                    : "delivery_cash_orders";

                return ordersSupabase
                    .from(table)
                    .update({delivery_boy_location:locationData})
                    .eq("order_id",order.order_id)
                    .eq("delivery_boy_mobile",currentDeliveryBoy.mobile);
            })
        );

        const failed = results.find(result => result.error);
        if(failed){ throw failed.error; }

        ignoreLocationRealtimeUntil = Date.now() + 4000;
        lastLocationSavedAt = Date.now();
        updateLocationStatus(true,"Updated just now");
        updateActiveOrdersLimit();
    }catch(error){
        console.error("Silent location update error:",error);
        updateLocationStatus(false,"Could not send location");
    }finally{
        deliveryLocationUpdating = false;
    }
};

startDeliveryLocationTracking = function(order){
    if(!navigator.geolocation){
        updateLocationStatus(false,"Location is not supported");
        return;
    }

    trackedDeliveryOrder = order || getActiveAcceptedOrders()[0] || null;
    updateActiveOrdersLimit();

    if(deliveryLocationWatchId === null){
        deliveryLocationWatchId = navigator.geolocation.watchPosition(
            function(position){
                latestDeliveryLocation = {
                    latitude:position.coords.latitude,
                    longitude:position.coords.longitude,
                    accuracy:position.coords.accuracy,
                    heading:position.coords.heading,
                    speed:position.coords.speed
                };
                if(!lastLocationSavedAt){ saveDeliveryBoyLocation(); }
            },
            function(error){
                console.error("Delivery location permission/error:",error);
                updateLocationStatus(false,"Allow location permission");
            },
            {enableHighAccuracy:true,maximumAge:0,timeout:15000}
        );
    }

    if(!deliveryLocationTimer){
        deliveryLocationTimer = setInterval(saveDeliveryBoyLocation,LOCATION_SYNC_INTERVAL);
    }

    updateLocationStatus(true,"GPS active in background");
};

// Ignore realtime events generated only by our own location writes.
const originalScheduleOrdersReload = scheduleOrdersReload;
scheduleOrdersReload = function(payload){
    const changedColumns = payload?.new && payload?.old
        ? Object.keys(payload.new).filter(key => JSON.stringify(payload.new[key]) !== JSON.stringify(payload.old[key]))
        : [];

    if(Date.now() < ignoreLocationRealtimeUntil ||
       (changedColumns.length === 1 && changedColumns[0] === "delivery_boy_location")){
        return;
    }

    if(!localStorage.getItem(DUTY_START_KEY)){ return; }
    clearTimeout(ordersReloadTimer);
    loadOrders({silent:true});
};

window.buildDeliveryBoyStats = buildDeliveryBoyStats;
window.checkCodPaymentStatus = checkCodPaymentStatus;
window.closeCancelledOrderAlert = closeCancelledOrderAlert;
window.closeProfile = closeProfile;
window.closeTerms = closeTerms;
window.completeCodPayment = completeCodPayment;
window.createDeliveryUuid = createDeliveryUuid;
window.endDuty = endDuty;
window.escapeHtml = escapeHtml;
window.finishDutyOrdersInDatabase = finishDutyOrdersInDatabase;
window.formatDutyTime = formatDutyTime;
window.formatMoney = formatMoney;
window.getActiveAcceptedOrders = getActiveAcceptedOrders;
window.getCalculatedItemsTotal = getCalculatedItemsTotal;
window.getCurrentDutyDetails = getCurrentDutyDetails;
window.getDeliveryBoyEarning = getDeliveryBoyEarning;
window.getDistanceText = getDistanceText;
window.getFinalOrderTotal = getFinalOrderTotal;
window.getItemImage = getItemImage;
window.getItemName = getItemName;
window.getItemQuantity = getItemQuantity;
window.getItemUnitPrice = getItemUnitPrice;
window.getItemUnitText = getItemUnitText;
window.getMapUrl = getMapUrl;
window.getOrCreateDutySession = getOrCreateDutySession;
window.getOrderAction = getOrderAction;
window.getOrderItems = getOrderItems;
window.getOrdersShimmer = getOrdersShimmer;
window.getTotalOrderedItems = getTotalOrderedItems;
window.handleCustomerOrderStatusRealtime = handleCustomerOrderStatusRealtime;
window.handleLiveOrderCancelled = handleLiveOrderCancelled;
window.hasCustomerLocation = hasCustomerLocation;
window.initializeDeliveryBoy = initializeDeliveryBoy;
window.isCodOrderPaid = isCodOrderPaid;
window.isCurrentPartnerOrder = isCurrentPartnerOrder;
window.loadDeliveryProductDetails = loadDeliveryProductDetails;
window.loadOrders = loadOrders;
window.loadOrdersSilently = loadOrdersSilently;
window.loadProfileDetails = loadProfileDetails;
window.logoutUser = logoutUser;
window.normalizeOrderStatus = normalizeOrderStatus;
window.openAttendance = openAttendance;
window.openCancelledOrders = openCancelledOrders;
window.openFAQ = openFAQ;
window.openPrivacy = openPrivacy;
window.openProfile = openProfile;
window.openSupport = openSupport;
window.openTerms = openTerms;
window.openYourOrders = openYourOrders;
window.prepareOrderProducts = prepareOrderProducts;
window.readCodJsonResponse = readCodJsonResponse;
window.refreshLocationStatusAge = refreshLocationStatusAge;
window.renderOneOrder = renderOneOrder;
window.renderOrderBill = renderOrderBill;
window.renderOrderProducts = renderOrderProducts;
window.resetCodQrUi = resetCodQrUi;
window.restoreDutyTimer = restoreDutyTimer;
window.saveAcceptedOrderDutyStats = saveAcceptedOrderDutyStats;
window.saveCodPaidOrder = saveCodPaidOrder;
window.saveDeliveryBoyLocation = saveDeliveryBoyLocation;
window.scheduleOrdersReload = scheduleOrdersReload;
window.setCodPaymentStep = setCodPaymentStep;
window.showCodPaymentError = showCodPaymentError;
window.showCompletedOrderEarning = showCompletedOrderEarning;
window.showDutyRunning = showDutyRunning;
window.sortOrders = sortOrders;
window.startCodPaymentPolling = startCodPaymentPolling;
window.startDeliveryLocationTracking = startDeliveryLocationTracking;
window.startDuty = startDuty;
window.stopCodPaymentPolling = stopCodPaymentPolling;
window.stopDeliveryLocationTracking = stopDeliveryLocationTracking;
window.stopOrdersSystem = stopOrdersSystem;
window.subscribeToOrdersRealtime = subscribeToOrdersRealtime;
window.syncOrdersDom = syncOrdersDom;
window.updateActiveOrdersLimit = updateActiveOrdersLimit;
window.updateDutyTimer = updateDutyTimer;
window.updateLocationStatus = updateLocationStatus;
window.uploadDeliveryProofImage = uploadDeliveryProofImage;
})();
