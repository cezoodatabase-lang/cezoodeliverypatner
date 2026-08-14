(function(){

/* =====================================================
   CEZOO DELIVERY PARTNER
   EARNINGS + YOUR DELIVERED ORDERS
===================================================== */

const EARNINGS_SUPABASE_URL =
    "https://ycqwdeiykbkfmmlpgdzd.supabase.co";

const EARNINGS_SUPABASE_KEY =
    "sb_publishable_-4RzQVudUy_VsvSpHTxNfg_hrdsQW0j";

const earningsSupabase =
    window.supabase.createClient(
        EARNINGS_SUPABASE_URL,
        EARNINGS_SUPABASE_KEY
    );

let earningsRealtimeChannel = null;
let earningsReloadTimer = null;
let deliveredOrdersCache = [];
let deliveredOrdersOpen = false;


/* =====================================================
   HELPERS
===================================================== */

function getPartnerMobile(){

    return String(
        localStorage.getItem(
            "partner_mobile"
        ) || ""
    )
    .replace(/\D/g,"")
    .trim();
}


function formatEarningsMoney(value){

    const amount =
        Number(value);

    return new Intl.NumberFormat(
        "en-IN",
        {
            style:"currency",
            currency:"INR",
            maximumFractionDigits:2
        }
    ).format(
        Number.isFinite(amount)
            ? amount
            : 0
    );
}


function escapeEarningsHtml(value){

    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}


function getProfileEarningsElement(){

    return document.getElementById(
        "profileEarnings"
    );
}


function setProfileEarningsLoading(){

    const element =
        getProfileEarningsElement();

    if(!element){
        return;
    }

    element.innerHTML = `
        <span
            class="profileEarningsSpinner"
            aria-label="Loading earnings"
        ></span>
    `;
}


function setProfileEarnings(amount){

    const element =
        getProfileEarningsElement();

    if(!element){
        return;
    }

    element.textContent =
        formatEarningsMoney(amount);
}


/* =====================================================
   NORMALIZE ORDERS
===================================================== */

function getOrderFinalTotal(order){

    const possibleValues = [
        order.total_amount,
        order.total_to_pay,
        order.grand_total,
        order.final_total,
        order.total,
        order.amount
    ];

    for(const value of possibleValues){

        const number =
            Number(value);

        if(Number.isFinite(number)){
            return number;
        }
    }

    return 0;
}


function normalizeDeliveredOrder(
    order,
    paymentType
){

    return {
        ...order,

        _payment_type:
            paymentType,

        _earning:
            Number(
                order.delivery_boy_earnings ??
                order.delivery_boy_stats?.earnings ??
                0
            ) || 0,

        _distance:
            Number(
                order.delivery_distance ??
                order.distance ??
                0
            ) || 0,

        _final_total:
            getOrderFinalTotal(order),

        _sort_time:
            new Date(
                order.delivered_at ||
                order.updated_at ||
                order.created_at ||
                0
            ).getTime()
    };
}


/* =====================================================
   FETCH ALL DELIVERED ORDERS FOR THIS PARTNER
===================================================== */

async function fetchDeliveredOrders(){

    const mobile =
        getPartnerMobile();

    if(!mobile){

        deliveredOrdersCache = [];
        return [];
    }

    const [
        cashResponse,
        upiResponse
    ] = await Promise.all([

        earningsSupabase
            .from("delivery_cash_orders")
            .select("*")
            .eq(
                "delivery_boy_mobile",
                mobile
            )
            .eq(
                "delivery_status",
                "delivered"
            ),

        earningsSupabase
            .from("delivery_upi_orders")
            .select("*")
            .eq(
                "delivery_boy_mobile",
                mobile
            )
            .eq(
                "delivery_status",
                "delivered"
            )

    ]);


    if(cashResponse.error){
        throw cashResponse.error;
    }

    if(upiResponse.error){
        throw upiResponse.error;
    }


    deliveredOrdersCache = [
        ...(cashResponse.data || [])
            .map(function(order){
                return normalizeDeliveredOrder(
                    order,
                    "cash"
                );
            }),

        ...(upiResponse.data || [])
            .map(function(order){
                return normalizeDeliveredOrder(
                    order,
                    "upi"
                );
            })
    ]
    .sort(function(a,b){
        return b._sort_time -
            a._sort_time;
    });


    return deliveredOrdersCache;
}


/* =====================================================
   PROFILE EARNINGS
===================================================== */

async function loadDeliveryPartnerEarnings(
    options = {}
){

    if(options.showLoader === true){
        setProfileEarningsLoading();
    }

    try{

        const orders =
            await fetchDeliveredOrders();

        const totalEarnings =
            orders.reduce(
                function(total,order){

                    return total +
                        Number(
                            order._earning ||
                            0
                        );
                },
                0
            );


        setProfileEarnings(
            totalEarnings
        );


        console.log(
            "💰 Profile earnings updated:",
            {
                mobile:
                    getPartnerMobile(),

                delivered_orders:
                    orders.length,

                total_earnings:
                    totalEarnings
            }
        );


        return totalEarnings;

    }catch(error){

        console.error(
            "❌ Profile earnings load error:",
            {
                message:error?.message,
                details:error?.details,
                hint:error?.hint,
                code:error?.code,
                raw:error
            }
        );

        /*
          Never leave loader stuck.
        */
        setProfileEarnings(0);

        return null;
    }
}


/* =====================================================
   YOUR ORDERS SCREEN
===================================================== */

function showYourOrdersLoader(){

    const body =
        document.getElementById(
            "yourOrdersBody"
        );

    if(!body){
        return;
    }

    body.innerHTML = `
        <div class="yourOrdersLoader">
            <span
                class="yourOrdersSpinner"
                aria-label="Loading delivered orders"
            ></span>
        </div>
    `;
}


function renderYourOrders(){

    const body =
        document.getElementById(
            "yourOrdersBody"
        );

    if(!body){
        return;
    }


    if(
        deliveredOrdersCache.length === 0
    ){

        body.innerHTML = `
            <div class="yourOrdersEmpty">

                <i class="fa-solid fa-box-open"></i>

                <h3>No delivered orders yet</h3>

                <p>
                    Completed deliveries will appear here.
                </p>

            </div>
        `;

        return;
    }


    const totalEarnings =
        deliveredOrdersCache.reduce(
            function(total,order){

                return total +
                    Number(
                        order._earning ||
                        0
                    );
            },
            0
        );


    body.innerHTML = `
        <div class="yourOrdersSummary">

            <span>
                ${deliveredOrdersCache.length}
                Delivered
                ${
                    deliveredOrdersCache.length === 1
                        ? "Order"
                        : "Orders"
                }
            </span>

            <strong>
                ${formatEarningsMoney(
                    totalEarnings
                )}
            </strong>

        </div>


        <div class="yourOrdersList">

            ${
                deliveredOrdersCache
                    .map(function(order){

                        const paymentType =
                            order._payment_type === "upi"
                                ? "UPI"
                                : "Cash";

                        const distance =
                            Number(
                                order._distance ||
                                0
                            ).toFixed(2);

                        return `
                            <div class="deliveredOrderRow">

                                <div class="deliveredOrderTop">

                                    <div class="deliveredOrderId">

                                        <span>
                                            Order ID
                                        </span>

                                        <strong>
                                            ${escapeEarningsHtml(
                                                order.order_id ||
                                                order.id ||
                                                "—"
                                            )}
                                        </strong>

                                    </div>


                                    <span
                                        class="
                                            deliveredPaymentBadge
                                            ${order._payment_type}
                                        "
                                    >
                                        ${paymentType}
                                    </span>

                                </div>


                                <div class="deliveredOrderStats">

                                    <div class="deliveredStat">

                                        <span>
                                            Distance
                                        </span>

                                        <strong>
                                            ${distance} km
                                        </strong>

                                    </div>


                                    <div class="
                                        deliveredStat
                                        earning
                                    ">

                                        <span>
                                            Earnings
                                        </span>

                                        <strong>
                                            ${formatEarningsMoney(
                                                order._earning
                                            )}
                                        </strong>

                                    </div>


                                    <div class="deliveredStat">

                                        <span>
                                            Final Total
                                        </span>

                                        <strong>
                                            ${formatEarningsMoney(
                                                order._final_total
                                            )}
                                        </strong>

                                    </div>

                                </div>

                            </div>
                        `;

                    })
                    .join("")
            }

        </div>
    `;
}


async function loadYourDeliveredOrders(){

    showYourOrdersLoader();

    try{

        await fetchDeliveredOrders();

        renderYourOrders();

        /*
          Same fetch also refreshes the green earnings card.
        */
        const totalEarnings =
            deliveredOrdersCache.reduce(
                function(total,order){

                    return total +
                        Number(
                            order._earning ||
                            0
                        );
                },
                0
            );

        setProfileEarnings(
            totalEarnings
        );

    }catch(error){

        console.error(
            "❌ Your Orders load error:",
            {
                message:error?.message,
                details:error?.details,
                hint:error?.hint,
                code:error?.code,
                raw:error
            }
        );

        const body =
            document.getElementById(
                "yourOrdersBody"
            );

        if(body){

            body.innerHTML = `
                <div class="yourOrdersEmpty">

                    <i class="
                        fa-solid
                        fa-triangle-exclamation
                    "></i>

                    <h3>
                        Could not load orders
                    </h3>

                    <p>
                        Please try again.
                    </p>

                </div>
            `;
        }
    }
}


/* =====================================================
   OPEN / CLOSE
===================================================== */

window.openDeliveryEarningsOrders =
    async function(){

        const overlay =
            document.getElementById(
                "yourOrdersOverlay"
            );

        if(!overlay){

            console.error(
                "Your Orders overlay not found"
            );

            return;
        }


        /*
          Close profile drawer first.
        */
        const profileOverlay =
            document.getElementById(
                "profileOverlay"
            );

        profileOverlay?.classList.remove(
            "open"
        );


        deliveredOrdersOpen = true;

        overlay.classList.add(
            "open"
        );

        document.body.style.overflow =
            "hidden";


        /*
          Spinner first, then delivered orders.
        */
        await loadYourDeliveredOrders();
    };


window.closeDeliveryEarningsOrders =
    function(){

        const overlay =
            document.getElementById(
                "yourOrdersOverlay"
            );

        overlay?.classList.remove(
            "open"
        );

        deliveredOrdersOpen = false;

        document.body.style.overflow =
            "";
    };


/*
  Compatibility aliases in case old HTML is cached.
*/
window.openYourOrders =
    window.openDeliveryEarningsOrders;

window.closeYourOrders =
    window.closeDeliveryEarningsOrders;


/* =====================================================
   REALTIME
===================================================== */

function scheduleEarningsReload(){

    clearTimeout(
        earningsReloadTimer
    );

    earningsReloadTimer =
        setTimeout(
            async function(){

                try{

                    await fetchDeliveredOrders();

                    const totalEarnings =
                        deliveredOrdersCache
                            .reduce(
                                function(total,order){

                                    return total +
                                        Number(
                                            order._earning ||
                                            0
                                        );
                                },
                                0
                            );

                    setProfileEarnings(
                        totalEarnings
                    );


                    if(deliveredOrdersOpen){
                        renderYourOrders();
                    }

                }catch(error){

                    console.error(
                        "Realtime earnings reload error:",
                        error
                    );
                }

            },
            100
        );
}


function stopEarningsRealtime(){

    if(!earningsRealtimeChannel){
        return;
    }

    earningsSupabase.removeChannel(
        earningsRealtimeChannel
    );

    earningsRealtimeChannel = null;
}


function startEarningsRealtime(){

    stopEarningsRealtime();

    const mobile =
        getPartnerMobile();

    if(!mobile){
        return;
    }


    earningsRealtimeChannel =
        earningsSupabase
            .channel(
                "delivery-partner-earnings-" +
                mobile
            )

            .on(
                "postgres_changes",
                {
                    event:"*",
                    schema:"public",
                    table:
                        "delivery_cash_orders",
                    filter:
                        "delivery_boy_mobile=eq." +
                        mobile
                },
                scheduleEarningsReload
            )

            .on(
                "postgres_changes",
                {
                    event:"*",
                    schema:"public",
                    table:
                        "delivery_upi_orders",
                    filter:
                        "delivery_boy_mobile=eq." +
                        mobile
                },
                scheduleEarningsReload
            )

            .subscribe(
                function(status){

                    console.log(
                        "💰 Earnings realtime:",
                        status
                    );
                }
            );
}


/* =====================================================
   INIT
===================================================== */

async function initEarnings(){

    const element =
        getProfileEarningsElement();

    if(!element){

        setTimeout(
            initEarnings,
            100
        );

        return;
    }


    /*
      If login has not stored partner_mobile yet, don't permanently
      initialise earnings as ₹0. The order-page hook will call this
      function again as soon as login/verification finishes.
    */
    if(!getPartnerMobile()){

        setProfileEarnings(0);
        return;
    }


    /*
      EXACT amount position:
      spinner first, then ₹ value.
    */
    setProfileEarningsLoading();


    await loadDeliveryPartnerEarnings({
        showLoader:false
    });


    startEarningsRealtime();
}


/* =====================================================
   PUBLIC REFRESH
===================================================== */

window.refreshDeliveryPartnerEarnings =
    function(){

        return loadDeliveryPartnerEarnings({
            showLoader:false
        });
    };


window.startDeliveryPartnerEarnings =
    function(){

        return initEarnings();
    };


window.stopDeliveryPartnerEarnings =
    stopEarningsRealtime;


/* =====================================================
   START
===================================================== */

if(
    document.readyState === "loading"
){

    document.addEventListener(
        "DOMContentLoaded",
        initEarnings,
        {
            once:true
        }
    );

}else{

    initEarnings();
}


document.addEventListener(
    "visibilitychange",
    function(){

        if(
            document.visibilityState ===
            "visible"
        ){

            loadDeliveryPartnerEarnings({
                showLoader:false
            });
        }
    }
);


window.addEventListener(
    "pageshow",
    function(){

        loadDeliveryPartnerEarnings({
            showLoader:false
        });
    }
);

})();