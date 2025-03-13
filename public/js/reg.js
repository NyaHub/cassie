document.forms[0].addEventListener("submit", async (e) => {
    e.preventDefault()

    const res = await req({
        method: "post",
        url: "/api/v1/acc/register",
        headers: {
            "Content-type": "application/json"
        },
        params: JSON.stringify({
            password: document.getElementById("password").value,
            username: document.getElementById("username").value,
            email: document.getElementById("email").value
        })
    })
    console.log(res)
})