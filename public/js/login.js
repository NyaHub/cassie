document.forms[0].addEventListener("submit", async (e) => {
    e.preventDefault()

    const res = await req({
        method: "post",
        url: "/api/v1/login",
        headers: {
            "Content-type": "application/json"
        },
        params: JSON.stringify({
            password: document.getElementById("password").value,
            login: document.getElementById("login").value
        })
    })
    console.log(res)
})