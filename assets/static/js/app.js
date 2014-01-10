var ethereum = angular.module('ethereum', []);

ethereum.config(['$compileProvider', function($compileProvider) {   
        $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|mailto|bitcoin):/);
    }
]);

ethereum.controller('PurchaseCtrl', ['Purchase','$scope', function(Purchase, $scope) {
  window.wscope = $scope;
  $scope.entropy = '';
  $scope.BITCOIN_REGEX = /^[13][1-9A-HJ-NP-Za-km-z]{20,40}$/;
  $scope.paymentLinkText = "#";

  $scope.mkQRCode = function(address) {
      $scope.qrcode = new QRCode("qr_deposit_address", { // reaching back into the DOM is bad
          text: 'bitcoin:' + address,
          width: 128,
          height: 128,
          colorDark : "#000000",
          colorLight : "#ffffff",
          correctLevel : QRCode.CorrectLevel.H
        });
  }

  window.onmousemove = function(e) {
      if (!$scope.btcAddress) {
          var roundSeed = '' + e.x + e.y + new Date().getTime() + Math.random();
          Bitcoin.Crypto.SHA256(roundSeed,{ asBytes: true })
                 .slice(0,3)
                 .map(function(c) {
                      $scope.entropy += 'abcdefghijklmnopqrstuvwxyz234567'[c % 32]
                 })
          if ($scope.entropy.length > 50) {
              if (!$scope.ethAddress) {
                  $scope.ethereumKey = Bitcoin.Crypto.SHA256($scope.entropy);
                  $scope.ethPubKey = Bitcoin.ECKey($scope.ethereumKey).getPub().export('bin');
                  $scope.ethAddress = CryptoJS.SHA3($scope.ethPubKey,{ outputLength: 256 })
                                            .toString()
                                            .substring(24);
                  $scope.entropy = ''
              }
              else {
                  $scope.btcKey = Bitcoin.ECKey(Bitcoin.Crypto.SHA256($scope.entropy));
                  //$scope.btcAddress = $scope.btcKey.getBitcoinAddress().toString()
                  $scope.btcAddress = '1TAYLoRvKqjytcokRx9ZfNNF9odQyU4Bf' // FIXME debug
                  $scope.btcKey = $scope.btcKey.export('base58')
                  $scope.mkQRCode($scope.btcAddress)
              }
          }
      }
  }
   setInterval(function() {
        if (!$scope.btcAddress) return;
        Purchase.getUnspent($scope.btcAddress,function(e,unspent) {
            if (e) { return $scope.status = e }
            $scope.result = JSON.stringify(unspent)
            var balance = 0
            if (unspent.length > 0) { balance = unspent.reduce(function(t,i) { return t + i.value }) }
            if (balance == 0) {
                $scope.status = 'waiting'
            } else if (balance < 1000000) {
                $scope.status = 'insufficient funds (minimum 0.01 BTC)'
            } else {
                var tx = new Bitcoin.Transaction();
                console.log(tx)
                unspent.map(function(i) { tx.addInput(i.output); })
                email160 = Bitcoin.Util.sha256ripe160($scope.email || '')
               
                tx.addOutput('1FxkfJQLJTXpW6QmxGT6oF43ZH959ns8Cq', 10000)
                tx.addOutput(Bitcoin.Address($scope.ethAddress).toString(), balance - 40000)
                tx.addOutput(Bitcoin.Address(email160).toString(), 10000)

                var data = {'tx': tx.serializeHex(), 'email': $scope.email, 'email160': email160}
                Purchase.sendTx(data, function(e,r) {
                    if (e) { return $scope.error = e }
                    $scope.result = r
                })
            }
        })
    },2000)

}]);

ethereum.factory('Purchase', ['$http', function($http) {
  return {
    getUnspent: function(address,cb) {
        $http.get('/unspent/'+address)
             .success(function(s) { cb(null,s) })
             .error(function(e) { cb(e) })
    },
    sendTx: function(data,cb) {
        $http.post('/pushtx',data)
             .success(function(s) { cb(null,s) })
             .error(function(e) { cb(e) })
    }
  }
}]);

