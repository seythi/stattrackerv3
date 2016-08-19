myAppModule.controller('loginController', ['$scope', '$location', 'campaignFactory', function ($scope, $location, campaignFactory){
          $scope.login = function(){
            socket.emit('loginattempt', {title: $scope.title, name: $scope.name, code: $scope.code});
            
          };
          $scope.register = function(){
            socket.emit('registerattempt', {title: $scope.title, name: $scope.name, code: $scope.code})
            
          };
          socket.on('result', function(data){
              if(data.success)
              {
                campaignFactory.ascribe(data.name, data.title);
                $scope.$apply(function () {
                   $location.path(data.path);
                })

              }
              else 
              {
                $scope.error = data.error;
                $scope.$apply();
              }
            });
      }]);