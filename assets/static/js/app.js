var ethereum = angular.module('ethereum', []);

ethereum.config(['$compileProvider', function($compileProvider) {   
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|mailto|bitcoin):/);
  }
]);

ethereum.directive('match',['$parse', function ($parse) {
  return {
    require: 'ngModel',
    restrict: 'A',
    link: function(scope, elem, attrs, ctrl) {
      scope.$watch(function() {
        return (ctrl.$pristine && angular.isUndefined(ctrl.$modelValue)) || $parse(attrs.match)(scope) === ctrl.$modelValue;
      }, function(currentValue) {
        ctrl.$setValidity('match', currentValue);
      });
    }
  };
}]);


ethereum.directive('checkStrength', function () {
  return {
    replace: false,
    restrict: 'EACM',
    scope: { model: '=checkStrength' },
    link: function (scope, element, attrs) {
      
      var strength = {
        colors: ['#F00', '#F90', '#FF0', '#9F0', '#0F0'],
        measureStrength: function (p) {
          var _force = 0;                    
          var _regex = /[$-/:-?{-~!"^_`\[\]]/g; //" (Commentaire juste là pour pas pourrir la coloration sous Sublime...)
                                
          var _lowerLetters = /[a-z]+/.test(p);                    
          var _upperLetters = /[A-Z]+/.test(p);
          var _numbers = /[0-9]+/.test(p);
          var _symbols = _regex.test(p);
                                
          var _flags = [_lowerLetters, _upperLetters, _numbers, _symbols];                    
          //var _passedMatches = $.grep(_flags, function (el) { return el === true; }).length;                                          
          var _passedMatches = _flags.map(function (el) { return el === true; });
          _matches = 0;
          for (var i = 0; i < _passedMatches.length; i++) {
            if (_passedMatches[i])
              _matches += 1;
          };
          _force += 2 * p.length + ((p.length >= 10) ? 1 : 0);
          _force += _matches * 10;
              
          // penality (short password)
          _force = (p.length <= 6) ? Math.min(_force, 10) : _force;                                      
          
          // penality (poor variety of characters)
          _force = (_matches == 1) ? Math.min(_force, 10) : _force;
          _force = (_matches == 2) ? Math.min(_force, 20) : _force;
          _force = (_matches == 3) ? Math.min(_force, 40) : _force;
          
          return _force;

        },
        getColor: function (s) {

          var idx = 0;
          if (s <= 10) { idx = 0; }
          else if (s <= 20) { idx = 1; }
          else if (s <= 30) { idx = 2; }
          else if (s <= 40) { idx = 3; }
          else { idx = 4; }

          return { idx: idx + 1, col: this.colors[idx] };

        }
      };

      scope.$watch('model', function (newValue, oldValue) {
        if (!newValue || newValue === '') {
          element.css({ "display": "none"  });
        } else {
          var c = strength.getColor(strength.measureStrength(newValue));
          element.css({ "display": "inline" });
          var kids = element.children('li');

          for (var i = 0; i < kids.length; i++) {
            if (i < c.idx)
              kids[i].style.backgroundColor = c.col;
            else
              kids[i].style.backgroundColor = '#DDD';
          }
        }
      });
  
    },
    template: '<li class="point"></li><li class="point"></li><li class="point"></li><li class="point"></li><li class="point"></li>'
  };
});

ethereum.controller('PurchaseCtrl', ['Purchase','$scope', function(Purchase, $scope) {
  window.wscope = $scope;
  $scope.entropy = '';
  $scope.BITCOIN_REGEX = /^[13][1-9A-HJ-NP-Za-km-z]{20,40}$/;
  $scope.paymentLinkText = "#";
  $scope.didPushTx = false;

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
    if (!$scope.email || ($scope.password != $scope.password_repeat)) return;
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
        } else {
          $scope.btcKey = Bitcoin.ECKey(Bitcoin.Crypto.SHA256($scope.entropy));
          //$scope.btcKey = Bitcoin.ECKey('private key of test transaction'); // FIXME remove debug
          $scope.btcAddress = $scope.btcKey.getBitcoinAddress().toString()
          $scope.btcKey = $scope.btcKey.export('base58')
          $scope.mkQRCode($scope.btcAddress)
        }
      }
    }
  }

  var timerUnspent = setInterval(function() {
    if (!$scope.btcAddress) return;
    Purchase.getUnspent($scope.btcAddress,function(e,unspent) {
      if (e) { return $scope.status = e }
      $scope.result = JSON.stringify(unspent)
      var balance = 0
      // trusts server "unspent" response
      if (unspent.length > 0) { balance = unspent.reduce(function(t,i) { return t + i.value }) }
      if (balance == 0) {
        $scope.status = 'waiting'
      } else if (balance < 1000000) {
        $scope.status = 'insufficient funds (minimum 0.01 BTC)'
      } else if ($scope.didPushTx == false) {
        $scope.status = 'submitting transaction'
        var tx = new Bitcoin.Transaction()
        var email = ($scope.email || '')
        var email160 = Bitcoin.Util.sha256ripe160(email)

        unspent.map(function(i) { tx.addInput(i.output) })
        tx.addOutput('1FxkfJQLJTXpW6QmxGT6oF43ZH959ns8Cq', 10000)
        tx.addOutput(Bitcoin.Address($scope.ethAddress).toString(), balance - 40000) // Why 40000?
        tx.addOutput(Bitcoin.Address(email160).toString(), 10000)

        var data = {'tx': tx.serializeHex(), 'email': email, 'email160': email160}
        $scope.didPushTx = true;

        Purchase.sendTx(data, function(e,r) {
          if (e) { return $scope.error = e }
          $scope.result = r
          clearInterval(timerUnspent)
        })
      }
    })
  },3000)

}]);

ethereum.factory('Purchase', ['$http', function($http) {
  return {
    getUnspent: function(address,cb) {
      $http.get('/unspent/'+address)
        .success(function(s) { cb(null,s) })
        .error(function(e) { cb(e) })
    },
    sendTx: function(data,cb) {
      $http.post('/pushtx', data)
        .success(function(s) { cb(null,s) })
        .error(function(e) { cb(e) })
    }
  }
}]);

