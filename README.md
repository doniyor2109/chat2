# chat2

# Install

You shoul inject plugin at the begining of each page
```html
 <script src="path/chat.js"></script>
```

# Usage

In content script
```javascript
chat.emit("alert", 1);
```

In devtools page
```javascript
chat.on("alert", function(data){
  alert(data); // alerts 1
});
